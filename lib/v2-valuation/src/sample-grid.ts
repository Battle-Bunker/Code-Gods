/**
 * Empirical rung values for grid rules that have no exact sum (owner decision 22: "If we can calculate calibration stats
 * for such rules accurately enough using simulation, then keep them"; docs/engine-v2/grids.md §5).
 *
 * The grid's law is known exactly and is a product of independent cells (π(board) = Π p(v)), so no walk is needed:
 * boards are drawn from π directly, and rare rungs by importance sampling with exact likelihood ratios.
 *
 * 1. **Adaptation (cross-entropy).** Starting from q₀ = π, each round draws boards from the current proposal q_t, a
 *    product over blocks of cells (one categorical law over each block's joint values), keeps the best ρ of them by
 *    level (the elite), and refits each block's law to the elite, weighted by π/q_t, smoothed and floored so that every
 *    value keeps some mass. The blocks are the family's units when it declares them (gridSums), else its sampling hint
 *    (gridSampleBlocks), else single cells, and only blocks of one or two cells are used: a pair lets a proposal say
 *    "these two cells add up to 9", which a product of cells cannot. Any partition keeps the estimate exact; blocks only
 *    make it efficient. Rounds stop once the elite
 *    reach the ladder's top (or stop climbing). Every proposal is kept.
 * 2. **Estimation (defensive mixture).** Boards are drawn from a fixed mixture of every proposal, π included (half the
 *    draws from the last proposal, which aims at the top; half spread evenly over all of them), and weighted by
 *    π(x)/q_mix(x), which is exact. One sample values every rung: P̂_k = mean(w·[level ≥ k]), with its
 *    standard error from the sample variance and the effective sample size of the rung's weights.
 * 3. Passes double the sample until every rung meets the error target with an effective sample size of at least
 *    `minEss`, or the budget runs out; rungs that do not are left unconverged and the dealt ladder is capped below them
 *    (spec §7.5, call (g)).
 *
 * Validation (decision 22, mandatory before an empirical value is dealt): every grid rule that has an exact value is
 * also sampled, and the two must agree within the sampler's own interval on every rung (test/sample-grid.test.ts; the
 * table is in grids.md §5).
 */
import { CONTINUITY_BITS } from "./exact-grid.ts";
import { evaluateObject, levelOf, objectLadder, rng, type ObjectType, type Score, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";
import { cellProbability, gridParams, gridSums, type GridState } from "@workspace/v2-grid";

export interface SampleConfig {
  /** Boards per adaptation round. */
  readonly roundSamples: number;
  /** The elite share. */
  readonly rho: number;
  /** Smoothing: the new law's weight. */
  readonly alpha: number;
  /** Each value's least share in a proposal (mixed with the uniform law). */
  readonly floor: number;
  readonly maxRounds: number;
  /** The first estimation pass; doubled while rungs miss the target, up to the budget. */
  readonly firstPass: number;
  /** Board evaluations in all (adaptation and estimation). */
  readonly budget: number;
  readonly targetRelError: number;
  readonly absFloorBits: number;
  /**
   * A rung converges only when its weights' effective sample size is at least this: below it the sample standard error
   * of heavy-tailed weights is itself unreliable (measured: rungs with an effective size under ~30 missed the exact value
   * by up to 3.3 of their own standard errors).
   */
  readonly minEss: number;
}

export const SAMPLE_CONFIG: SampleConfig = {
  roundSamples: 2_000, rho: 0.1, alpha: 0.7, floor: 0.01, maxRounds: 40, firstPass: 50_000, budget: 3_200_000,
  targetRelError: 0.02, absFloorBits: 0.03, minEss: 200,
};

export interface SampledRung {
  readonly bits: number;
  /** One standard error, in bits. */
  readonly error: number;
  /** Effective sample size of the rung's weights (Kish). */
  readonly ess: number;
  readonly hits: number;
}

export interface SampledLadder {
  readonly rungs: readonly SampledRung[];
  readonly proposals: number;
  readonly evaluations: number;
  /** The last rung through which every rung met the error target. */
  readonly convergedThrough: number;
  /**
   * Distinct values each dealt layer takes with estimated probability at least 2^−CONTINUITY_BITS (the continuity check,
   * decision 13; the same criterion as the exact sums').
   */
  readonly distinct: readonly number[];
}

export function sampleGridLadder<P>(type: ObjectType<GridState>, family: RuleFamily<GridState, P>, params: P, variant: Variant,
  tieBreaker: TieBreaker, seed = "v2", config: Partial<SampleConfig> = {}): SampledLadder {
  const cfg = { ...SAMPLE_CONFIG, ...config };
  const { size, cap } = gridParams(variant);
  const cells = size * size, S = cap + 1;
  const ladder = objectLadder(type, family, params, variant, tieBreaker);
  const top = ladder.length - 1;
  const logP = Array.from({ length: S }, (_, v) => Math.log(cellProbability(v, variant)));
  const r = rng("grid-sample", seed, family.id, JSON.stringify(params), String(tieBreaker), variant.id);
  let evaluations = 0;
  let lastScore: ReturnType<typeof evaluateObject>["score"] = null;
  const levelOfBoard = (x: number[]): number => {
    evaluations++;
    lastScore = evaluateObject(type, family, params, { cells: x }, variant, tieBreaker).score;
    return levelOf(lastScore, ladder);
  };
  // Per dealt layer: each value's summed importance weight in the estimation sample.
  const mass: Map<string, number>[] = [];

  // Blocks: disjoint groups of at most four cells covering the board.
  // Blocks of more than two cells are split into cells: a table of 10^4 joint values cannot be fitted from a few hundred
  // elite boards (measured: the weights degenerate), while a pair's 100 can.
  const declared = (gridSums[family.id]?.units(variant) ?? []).filter(b => b.length <= 2);
  const covered = new Set(declared.flat());
  const blocks: number[][] = [...declared.map(b => [...b]), ...Array.from({ length: cells }, (_, i) => i).filter(i => !covered.has(i)).map(i => [i])];
  const sizes = blocks.map(b => S ** b.length);
  const codeOf = (x: readonly number[], b: readonly number[]) => b.reduce((t, i, j) => t + x[i]! * S ** j, 0);
  // A proposal: per block, a categorical law over its joint values (probabilities, logs, cumulative sums).
  type Proposal = { p: number[][]; logp: number[][]; cdf: number[][] };
  const make = (p: number[][]): Proposal => ({
    p, logp: p.map(row => row.map(Math.log)),
    cdf: p.map(row => { let a = 0; return row.map(x => (a += x)); }),
  });
  const draw = (q: Proposal): number[] => {
    const x = new Array<number>(cells).fill(0);
    blocks.forEach((b, k) => {
      const c = q.cdf[k]!, u = r.unit() * c[c.length - 1]!;
      let lo = 0, hi = c.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (u < c[mid]!) hi = mid; else lo = mid + 1; }
      let code = lo;
      for (const i of b) { x[i] = code % S; code = Math.floor(code / S); }
    });
    return x;
  };
  const logPi = (x: readonly number[]) => x.reduce((t, v) => t + logP[v]!, 0);
  const logQ = (q: Proposal, x: readonly number[]) => blocks.reduce((t, b, k) => t + q.logp[k]![codeOf(x, b)]!, 0);
  const piBlock = (b: readonly number[]) => Array.from({ length: S ** b.length }, (_, code) => {
    let lp = 0;
    for (let j = 0; j < b.length; j++) { lp += logP[code % S]!; code = Math.floor(code / S); }
    return Math.exp(lp);
  });

  const pi = make(blocks.map(piBlock));
  const proposals: Proposal[] = [pi];

  // 1. Cross-entropy adaptation towards the top rung.
  let q = pi, best = -1, stale = 0;
  for (let round = 0; round < cfg.maxRounds && evaluations < cfg.budget / 4; round++) {
    const xs = Array.from({ length: cfg.roundSamples }, () => draw(q));
    const ls = xs.map(levelOfBoard);
    const sorted = [...ls].sort((a, b) => b - a);
    const gamma = Math.min(top, sorted[Math.max(0, Math.floor(cfg.rho * ls.length) - 1)]!);
    const counts = sizes.map(n => new Array<number>(n).fill(0));
    let total = 0;
    xs.forEach((x, k) => {
      if (ls[k]! < gamma) return;
      const w = Math.exp(logPi(x) - logQ(q, x));
      total += w;
      blocks.forEach((b, j) => { counts[j]![codeOf(x, b)]! += w; });
    });
    if (total === 0) break;
    const next = q.p.map((row, j) => row.map((old, code) => {
      const fit = counts[j]![code]! / total;
      return (1 - cfg.floor) * (cfg.alpha * fit + (1 - cfg.alpha) * old) + cfg.floor / sizes[j]!;
    }));
    q = make(next);
    proposals.push(q);
    if (gamma >= top) break;
    if (gamma > best) { best = gamma; stale = 0; } else if (++stale >= 5) break;
  }

  // 2. Estimation from the defensive mixture of every proposal.
  const K = proposals.length;
  // Mixture weights: half on the last proposal, half evenly over every proposal (π included, so no rung is starved).
  const mix = proposals.map((_, k) => 0.5 / K + (k === K - 1 ? 0.5 : 0));
  const mixCdf = (() => { let a = 0; return mix.map(x => (a += x)); })();
  const logMix = mix.map(Math.log);
  const sumW = new Array<number>(top + 1).fill(0), sumW2 = new Array<number>(top + 1).fill(0), hits = new Array<number>(top + 1).fill(0);
  let n = 0;
  const target = (bits: number) => Math.max(cfg.targetRelError * bits, cfg.absFloorBits);
  const converged = (x: SampledRung) => Number.isFinite(x.bits) && x.error <= target(x.bits) && x.ess >= cfg.minEss;
  const summarise = (): SampledRung[] => sumW.map((_s, k) => {
    if (k === 0) return { bits: 0, error: 0, ess: n, hits: n };
    // Upper set: level ≥ k, so accumulate from the top down.
    let a = 0, b = 0, h = 0;
    for (let j = k; j <= top; j++) { a += sumW[j]!; b += sumW2[j]!; h += hits[j]!; }
    const mean = a / n;
    if (mean <= 0) return { bits: Infinity, error: Infinity, ess: 0, hits: 0 };
    const variance = Math.max(0, b / n - mean * mean) / n;
    const rel = Math.sqrt(variance) / mean;
    return { bits: -Math.log2(mean), error: rel / Math.LN2, ess: b > 0 ? (a * a) / b : 0, hits: h };
  });
  let pass = cfg.firstPass;
  let rungs: SampledRung[] = [];
  for (;;) {
    for (let i = 0; i < pass && evaluations < cfg.budget; i++) {
      const u = r.unit();
      let c = 0;
      while (c < K - 1 && u >= mixCdf[c]!) c++;
      const x = draw(proposals[c]!);
      const lp = logPi(x);
      // log of the mixture density: log Σ_k mix_k q_k(x), computed stably.
      const lq = proposals.map((pr, k) => logMix[k]! + logQ(pr, x));
      const m = Math.max(...lq);
      const lmix = m + Math.log(lq.reduce((t, l) => t + Math.exp(l - m), 0));
      const w = Math.exp(lp - lmix);
      const L = levelOfBoard(x);
      sumW[L]! += w; sumW2[L]! += w * w; hits[L]!++;
      (lastScore as Score)?.forEach((c, j) => { const m = (mass[j] ??= new Map()), k = c === null ? "null" : `${c.n}/${c.d}`; m.set(k, (m.get(k) ?? 0) + w); });
      n++;
    }
    rungs = summarise();
    const ok = rungs.every(x => converged(x));
    if (ok || evaluations >= cfg.budget) break;
    pass *= 2;
  }
  let convergedThrough = 0;
  for (let k = 1; k <= top; k++) { if (!converged(rungs[k]!)) break; convergedThrough = k; }
  return { rungs, proposals: K, evaluations, convergedThrough, distinct: mass.map(m => [...m.values()].filter(w => w / n >= 2 ** -CONTINUITY_BITS).length) };
}
