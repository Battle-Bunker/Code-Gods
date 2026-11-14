/**
 * The stationary-law estimator (spec §7.2). For each upper set U_i of a rule's ladder, a restricted walk samples
 * states within the stationary law; every sample is perturbed by one free walk step and counted in the row of its own
 * level; the level-to-level matrix's stationary vector gives the level masses, and a rung's value is −log2 of the mass
 * at least that good. Checked against an exactly solvable price list in test/estimate.test.ts.
 */
import {
  canonicalJson, evaluateObject, hashHex, levelOf, objectLadder, rng, ruleLayers, tieBreakerId, toWireQ, walkStep,
  type ObjectType, type RuleFamily, type Rung, type Score, type TieBreaker, type Variant,
} from "@workspace/v2-core";
import { stationary } from "./linalg.ts";

export interface ValuationConfig {
  /** Walk steps in total (the owner's "default compute investment"). */
  readonly computeBudget: number;
  /** Converged when every rung's error is within this share of its value … */
  readonly targetRelError: number;
  /** … or within this many bits (0.03 bits is a 2% error in a probability: log2 1.02 = 0.029). */
  readonly absFloorBits: number;
  /** Independent replicates; error bars are their delete-one jackknife. */
  readonly replicates: number;
  readonly burnIn: number;
  readonly thin: number;
  readonly perturbations: number;
  /**
   * A restricted chain proposes K free walk steps at once, K uniform on 1 … proposalSteps, and keeps the end only if it
   * is still in the upper set. Each P^K, and so their mixture, has the walk's stationary law; long proposals connect thin
   * upper sets (m = c) that single moves cannot, short ones are often accepted near a boundary.
   */
  readonly proposalSteps: number;
  /** Samples per chain in the first pass; each further pass doubles it. */
  readonly initialSamples: number;
  /**
   * A layer must take at least this many distinct values among all the samples (on the joint ladder every layer grades
   * lines at every level of the layers before it), or the rule is too coarse to extend a ladder (owner decision 13: "Require all rules to be continuous").
   */
  readonly minLevels: number;
}

export const DEFAULT_CONFIG: ValuationConfig = {
  computeBudget: 32_000_000, targetRelError: 0.02, absFloorBits: 0.03, replicates: 8,
  burnIn: 2_000, thin: 10, perturbations: 4, proposalSteps: 6, initialSamples: 64, minLevels: 6,
};

export interface RungEstimate {
  readonly label: string;
  readonly bits: number;
  readonly error: number;
  /** Diagnostics (spec §7.2 step 6). */
  readonly split: number;
  readonly splitError: number;
  readonly direct: number | null;
  readonly directError: number | null;
  /** True when the rung's level was never seen (its upper set equals the next rung's). */
  readonly empty: boolean;
}

export type Status = "converged" | "unconverged" | "unreachable" | "flagged" | "too-coarse";

export interface Estimate {
  readonly status: Status;
  readonly reasons: readonly string[];
  readonly rungs: readonly RungEstimate[];
  readonly reversibility: number;
  readonly mixingSteps: number;
  readonly samplesPerChain: number;
  readonly steps: number;
  /** Per rung: a state from replicate 0's chain on that rung's upper set at the end of the run (wire), to show sizes. */
  readonly examples: readonly string[];
  /** Per dealt layer: distinct values it took among all samples (null for multi-line objects). */
  readonly distinctLevels: readonly (number | null)[];
  /** The pooled level-matrix counts the values come from: row l, column j. */
  readonly levelMatrix: readonly (readonly number[])[];
  /**
   * Equilibration (spec §7.2 step 6): per rung i below the top, chain U_i's rate into U_{i+1} in the second half of its
   * samples minus that in the first half, averaged over replicates, and that mean over its standard error across them.
   * A seeded chain still drifting away from its start shows a nonzero drift; null where it cannot be measured.
   */
  readonly drift: readonly (readonly [number, number] | null)[];
  /** The highest rung r such that every rung 1 … r is within the error target (n when converged). */
  readonly convergedThrough: number;
}

export function ruleKey(type: ObjectType<unknown>, variant: Variant, familyId: string, params: unknown, tieBreaker: string): string {
  return `${type.id}@${type.version}/${variant.id}#${hashHex(canonicalJson(variant))}/${familyId}/${canonicalJson(params)}/tb=${tieBreaker}`;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stderr = (xs: readonly number[]) => {
  if (xs.length < 2) return Infinity;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
};
const tail = (w: readonly number[], i: number) => w.slice(i).reduce((a, b) => a + b, 0);

/** Whether every level reaches every other through positive entries (one communicating class). */
export function irreducible(T: readonly (readonly number[])[]): boolean {
  const m = T.length;
  const reach = (from: number, forward: boolean): boolean => {
    const seen = new Array<boolean>(m).fill(false);
    const stack = [from];
    seen[from] = true;
    while (stack.length) {
      const a = stack.pop()!;
      for (let b = 0; b < m; b++) if (!seen[b] && (forward ? T[a]![b]! : T[b]![a]!) > 0) { seen[b] = true; stack.push(b); }
    }
    return seen.every(Boolean);
  };
  return m <= 1 || (reach(0, true) && reach(0, false));
}

/** Integrated autocorrelation time of a series (in samples), truncated at the first small or negative autocorrelation. */
export function iat(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 4) return 1;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / n;
  if (v === 0) return 1;
  let tau = 1;
  for (let k = 1; k < n / 2; k++) {
    let c = 0;
    for (let i = 0; i + k < n; i++) c += (xs[i]! - m) * (xs[i + k]! - m);
    const rho = c / (n - k) / v;
    if (rho < 0.05) break;
    tau += 2 * rho;
  }
  return tau;
}

export interface EstimateInput<S, P> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly family: RuleFamily<S, P>;
  readonly params: P;
  /** The dealt tie-breaker (default: the family's first; null: the main layer alone). */
  readonly tieBreaker?: TieBreaker;
  readonly seed?: string;
  readonly config?: Partial<ValuationConfig>;
}

export function estimate<S, P>(input: EstimateInput<S, P>): Estimate {
  const { type, variant, family, params } = input;
  const cfg = { ...DEFAULT_CONFIG, ...input.config };
  const seed = input.seed ?? "v2";
  const tb = tieBreakerId(family, input.tieBreaker) === "none" ? null : tieBreakerId(family, input.tieBreaker);
  const layers = ruleLayers(family, tb).length;
  const key = ruleKey(type as ObjectType<unknown>, variant, family.id, params, tieBreakerId(family, tb));
  const fullLadder: readonly Rung[] = objectLadder(type, family, params, variant, tb);
  // The ladder calibrated: the full one, truncated below the first rung no replicate's climb could reach (step 1).
  let rungs: readonly Rung[] = fullLadder;
  const singleSite = type.sites(type.origin(variant), variant) === 1;
  // The continuity check counts each layer's distinct values over every sample: on the joint ladder (spec §4.4) the
  // tie-breaker grades lines at every main level, so it extends the ladder wherever it takes many values.
  const distinct: Set<string>[] = Array.from({ length: layers }, () => new Set());
  let n = rungs.length - 1;

  const cache = new Map<string, { score: Score }>();
  const scored = (s: S) => {
    const k = type.encode(s);
    let e = cache.get(k);
    if (e === undefined) {
      e = { score: evaluateObject(type, family, params, s, variant, tb).score };
      if (cache.size > 400_000) cache.clear();
      cache.set(k, e);
    }
    return e;
  };
  const level = (s: S): number => levelOf(scored(s).score, rungs);

  /**
   * The proposal and perturbation kernel: 1 … proposalSteps free walk steps, uniformly. It has the walk's stationary
   * law, so the level masses are still its level matrix's stationary vector (#347 §1.4.3: any perturbation built from
   * the moves will do); unlike a single step it joins levels that only a pair of moves connects (|c| along m = c).
   */
  const perturb = (x: S, r: ReturnType<typeof rng>): S => {
    let y = x;
    const len = 1 + r.below(cfg.proposalSteps);
    for (let j = 0; j < len; j++) y = walkStep(type, variant, y, r);
    return y;
  };
  /** Note the values of the layers that count at this sample (single-line objects). */
  const noteLayers = (s: S): void => {
    if (!singleSite) return;
    const sc = scored(s).score;
    if (sc === null) return;
    for (let j = 0; j < layers; j++) {
      const v = sc[j];
      distinct[j]!.add(v === null || v === undefined ? "undefined" : toWireQ(v));
    }
  };

  // 1. Seeds for each upper set, separately for each replicate (replicates that shared a start would share its
  // slowly forgotten bias, and their spread would understate the error): burn in freely, then climb without ever
  // lowering the level.
  let steps = 0;
  // Enumerated small states (when the type offers them), grouped by level: a thin rung is seeded from here.
  const byLevel: S[][] = Array.from({ length: n + 1 }, () => []);
  if (type.enumerate) {
    for (const s of type.enumerate(variant)) byLevel[level(s)]!.push(s);
    steps += byLevel.reduce((a, b) => a + b.length, 0);
  }
  const seedsFor = (rep: number): (S | null)[] => {
    const seeds: (S | null)[] = new Array(n + 1).fill(null);
    const r = rng(seed, key, "seeds", rep);
    let s = type.origin(variant);
    for (let t = 0; t < cfg.burnIn * cfg.proposalSteps; t++) s = walkStep(type, variant, s, r);
    steps += cfg.burnIn * cfg.proposalSteps;
    seeds[0] = s;
    // An enumerated state for each rung it reaches, drawn per replicate (replicates should not share a start).
    const enumerated = (i: number): S | null => {
      for (let l = i; l <= n; l++) if (byLevel[l]!.length) return byLevel[l]![r.below(byLevel[l]!.length)]!;
      return null;
    };
    for (let i = 1; i <= n; i++) {
      if (level(s) < i) { const e = enumerated(i); if (e !== null) s = e; }
      let tries = 0;
      while (level(s) < i && tries < 20 * cfg.burnIn) {
        const here = level(s);
        // Alternate a filtered single step and a kernel proposal: the first creeps along thin sets, the second jumps
        // between levels that only pairs of moves join.
        const y = tries % 2 === 0 ? walkStep(type, variant, s, r, x => level(x) >= here) : perturb(s, r);
        if (level(y) >= here) s = y;
        tries++;
      }
      steps += tries;
      if (level(s) < i) break;
      seeds[i] = s;
    }
    return seeds;
  };
  const allSeeds = Array.from({ length: cfg.replicates }, (_, rep) => seedsFor(rep));
  // Every replicate must start every chain: calibrate up to the last rung all of them reached.
  const reached = Math.min(...allSeeds.map(seeds => { const u = seeds.findIndex(x => x === null); return u === -1 ? n : u - 1; }));
  const truncation: string[] = [];
  if (reached < n) {
    truncation.push(`ladder truncated at rung ${reached}: no state found at rung ${reached + 1} (${rungs[reached + 1]!.label}) within ${20 * cfg.burnIn} climbing proposals`);
    if (reached === 0) {
      return {
        status: "unreachable", reasons: truncation,
        rungs: [], reversibility: NaN, mixingSteps: NaN, samplesPerChain: 0, steps, distinctLevels: [], levelMatrix: [], examples: [], drift: [], convergedThrough: 0,
      };
    }
    rungs = rungs.slice(0, reached + 1);
    n = reached;
  }

  // 2–3. One persistent chain per (replicate, upper set). Each pass extends every chain until it holds `target`
  // samples, so a doubling reuses the burn-in and every earlier sample.
  const K = (cfg.proposalSteps + 1) / 2;   // mean proposal length, for step accounting
  // `early` holds the samples and hits into the next upper set from every pass but the latest, `late` the latest pass's:
  // after a doubling, the first and the second half of the chain's samples.
  interface Chain { state: S; readonly r: ReturnType<typeof rng>; readonly i: number; samples: number; early: [number, number]; late: [number, number] }
  interface Replicate {
    readonly chains: Chain[];
    readonly C: number[][][];        // level matrix counts per chain: C[k][l][j], chain U_k, from level l to level j
    readonly inNext: number[];       // samples of U_i's chain in U_{i+1}
    readonly total: number[];
    readonly freeLevels: number[];   // levels of U_0's chain, in order
  }
  const move = (c: Chain): void => {
    const y = perturb(c.state, c.r);
    if (c.i === 0 || level(y) >= c.i) c.state = y;
  };
  const reps: Replicate[] = Array.from({ length: cfg.replicates }, (_, rep) => ({
    chains: rungs.map((_, i) => {
      const c: Chain = { state: allSeeds[rep]![i]!, r: rng(seed, key, "chain", rep, i), i, samples: 0, early: [0, 0], late: [0, 0] };
      for (let t = 0; t < cfg.burnIn; t++) move(c);
      steps += cfg.burnIn * K;
      return c;
    }),
    C: Array.from({ length: n + 1 }, () => Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0))),
    inNext: new Array<number>(n + 1).fill(0), total: new Array<number>(n + 1).fill(0), freeLevels: [],
  }));
  const extend = (target: number): void => {
    for (const rep of reps) for (const c of rep.chains) {
      c.early = [c.early[0] + c.late[0], c.early[1] + c.late[1]];
      c.late = [0, 0];
      while (c.samples < target) {
        for (let t = 0; t < cfg.thin; t++) move(c);
        steps += cfg.thin * K;
        const l = level(c.state);
        noteLayers(c.state);
        c.samples++;
        rep.total[c.i]!++;
        if (l >= c.i + 1) { rep.inNext[c.i]!++; c.late[1]++; }
        c.late[0]++;
        if (c.i === 0) rep.freeLevels.push(l);
        // Every chain samples within the stationary law, so a sample at level l is a draw from π restricted to L_l,
        // whichever upper set's chain produced it: perturb it and count it in row l (kept per chain, see rowsOf).
        for (let p = 0; p < cfg.perturbations; p++) rep.C[c.i]![l]![level(perturb(c.state, c.r))]!++;
        steps += cfg.perturbations * K;
      }
    }
  };
  const extendCost = (from: number, to: number) => cfg.replicates * (n + 1) * (to - from) * (cfg.thin + cfg.perturbations) * K;

  /**
   * Row l of the level matrix comes from the least restricted chains that sampled level l at least `minRow` times:
   * the free chain where it can, restricted chains only where they must. A restricted chain is exact only under
   * detailed balance, and its error sits at its own boundary, so a row taken from a chain whose boundary is below the
   * row's level carries the least of it.
   */
  const minRow = 64 * cfg.perturbations;
  const minUp = 16;
  /**
   * For each level, how many chains (U_0 … U_k) to pool: decided once on all replicates' counts, then used for each.
   * A row needs enough counts and, below the top, enough upward transitions: the rates that stitch rare levels to the
   * rest are the small ones, and a row that never saw one would cut the matrix in two.
   */
  const chainsFor = (): number[] => rungs.map((_, l) => {
    let total = 0, up = 0;
    for (let k = 0; k <= l; k++) {
      for (const r of reps) {
        const row = r.C[k]![l]!;
        for (let j = 0; j <= n; j++) { total += row[j]!; if (j > l) up += row[j]!; }
      }
      if (total >= minRow && (l === n || up >= minUp)) return k;
    }
    return l;
  });
  const rowsOf = (C: readonly (readonly (readonly number[])[])[], upTo: readonly number[]): number[][] => rungs.map((_, l) =>
    Array.from({ length: n + 1 }, (_, j) => { let a = 0; for (let k = 0; k <= upTo[l]!; k++) a += C[k]![l]![j]!; return a; }));

  /**
   * 4. Values from a level matrix. The levels valued are those of the communicating class that holds level 0 (sampled
   * levels that reach level 0 and are reached from it); transitions out of the class (into a level entered but never
   * sampled, or one that never leads back) are dropped and their rows renormalised. A level outside the class has mass
   * 0, so a rung that only such levels meet is worth Infinity bits: unconverged, while every rung below it keeps its own
   * finite value and error (a rare top rung that some replicate never saw no longer hides the errors of the rest).
   */
  const valuesOf = (C: readonly (readonly number[])[]): number[] => {
    const sampled = rungs.map((_, i) => C[i]!.some(x => x > 0));
    const reach = (forward: boolean): boolean[] => {
      const seen = rungs.map(() => false);
      if (!sampled[0]) return seen;
      const stack = [0];
      seen[0] = true;
      while (stack.length) {
        const a = stack.pop()!;
        for (let b = 0; b <= n; b++) if (!seen[b] && sampled[b] && (forward ? C[a]![b]! : C[b]![a]!) > 0) { seen[b] = true; stack.push(b); }
      }
      return seen;
    };
    const fwd = reach(true), back = reach(false);
    const cls = rungs.map((_, i) => i).filter(i => fwd[i] && back[i]);
    const T = cls.map(i => { const row = cls.reduce((a, j) => a + C[i]![j]!, 0); return cls.map(j => C[i]![j]! / row); });
    const w = cls.length ? stationary(T) : null;
    const full = new Array<number>(n + 1).fill(w ? 0 : NaN);
    if (w) cls.forEach((i, k) => { full[i] = w[k]!; });
    return rungs.map((_, i) => (i === 0 ? 0 : -Math.log2(tail(full, i))));
  };

  let N = cfg.initialSamples;
  extend(N);
  /**
   * 5. Point estimate from the counts of all replicates pooled (the eigenvector of a noisy matrix, read through a
   * logarithm, is biased; pooling keeps the noise, and so the bias, as small as the samples allow). Error bars by the
   * delete-one jackknife over replicates.
   */
  const sumRows = (sets: readonly (readonly (readonly number[])[])[]): number[][] =>
    Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => sets.reduce((a, C) => a + C[i]![j]!, 0)));
  const measure = () => {
    const upTo = chainsFor();
    const rows = reps.map(r => rowsOf(r.C, upTo));
    const pooled = sumRows(rows);
    const point = valuesOf(pooled);
    const R = rows.length;
    const loo = rows.map((_, d) => valuesOf(sumRows(rows.filter((_, k) => k !== d))));
    const error = rungs.map((_, i) => {
      const xs = loo.map(v => v[i]!);
      const m = mean(xs);
      return Math.sqrt(((R - 1) / R) * xs.reduce((a, x) => a + (x - m) ** 2, 0));
    });
    const empty = rungs.map((_, i) => pooled[i]!.every(x => x === 0) && pooled.every(row => row[i] === 0));
    const within = rungs.map((_, i) => {
      if (i === 0 || empty[i]) return true;
      if (!Number.isFinite(point[i]!) || !Number.isFinite(error[i]!)) return false;
      return error[i]! <= Math.max(cfg.targetRelError * point[i]!, cfg.absFloorBits);
    });
    const firstMiss = within.indexOf(false);
    return { point, error, pooled, empty, ok: firstMiss === -1, through: firstMiss === -1 ? n : firstMiss - 1 };
  };
  let st = measure();
  while (!st.ok && steps + extendCost(N, 2 * N) <= cfg.computeBudget) {
    extend(2 * N);
    N *= 2;
    st = measure();
  }

  // 6. Diagnostics.
  const split = reps.map(r => {
    let acc = 0;
    return rungs.map((_, i) => { if (i === 0) return 0; acc -= Math.log2(r.inNext[i - 1]! / r.total[i - 1]!); return acc; });
  });
  const direct = reps.map(r => rungs.map((_, i) => {
    const f = r.freeLevels.filter(l => l >= i).length / r.freeLevels.length;
    return f > 1 / 64 ? -Math.log2(f) : null;
  }));
  // Equilibration: paired over replicates, so the error bar carries the chains' autocorrelation. Only measured once the
  // chains have doubled at least once (the halves are the earlier passes and the latest one).
  const drift = rungs.map((_, i): readonly [number, number] | null => {
    if (i === n) return null;
    const ds = reps.map(r => { const c = r.chains[i]!; return c.early[0] && c.late[0] ? c.late[1] / c.late[0] - c.early[1] / c.early[0] : NaN; });
    if (ds.some(d => !Number.isFinite(d))) return null;
    const m = mean(ds), se = stderr(ds);
    return [m, se > 0 ? m / se : m === 0 ? 0 : Infinity];
  });
  const result = { split, direct, pooled: st.pooled, empty: st.empty, mixing: mean(reps.map(r => iat(r.freeLevels) * cfg.thin * K)) };

  const rungsOut: RungEstimate[] = rungs.map((r, i) => {
    const ss = result.split.map(v => v[i]!);
    const ds = result.direct.map(v => v[i]!).filter((x): x is number => x !== null);
    const full = ds.length === result.direct.length;
    return {
      label: r.label, bits: st.point[i]!, error: i === 0 ? 0 : st.error[i]!, split: mean(ss), splitError: i === 0 ? 0 : stderr(ss),
      direct: full ? mean(ds) : null, directError: full ? (i === 0 ? 0 : stderr(ds)) : null, empty: result.empty[i]!,
    };
  });

  // Reversibility on the pooled matrix.
  const active = rungs.map((_, i) => i).filter(i => result.pooled[i]!.some(x => x > 0));
  const T = active.map(i => { const row = result.pooled[i]!.reduce((a, b) => a + b, 0); return active.map(j => result.pooled[i]![j]! / row); });
  const w = (irreducible(T) ? stationary(T) : null) ?? T.map(() => 0);
  let circ = 0, flow = 0;
  for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
    const f = w[a]! * T[a]![b]!, g = w[b]! * T[b]![a]!;
    circ += Math.abs(f - g); flow += f + g;
  }

  const reasons: string[] = [...truncation];
  let status: Status = "converged";
  if (!st.ok) { status = "unconverged"; reasons.push(`not within ${cfg.targetRelError * 100}% after ${steps} steps (budget ${cfg.computeBudget})`); }
  for (const [i, r] of rungsOut.entries()) {
    if (i === 0 || r.empty) continue;
    const comb = 3 * Math.hypot(r.error, r.splitError);
    if (Number.isFinite(r.split) && Number.isFinite(comb) && Math.abs(r.split - r.bits) > Math.max(comb, cfg.absFloorBits)) reasons.push(`rung ${i}: splitting estimate ${r.split.toFixed(3)} against ${r.bits.toFixed(3)}`);
    if (r.direct !== null && Math.abs(r.direct - r.bits) > Math.max(3 * Math.hypot(r.error, r.directError ?? 0), cfg.absFloorBits)) {
      reasons.push(`rung ${i}: direct estimate ${r.direct.toFixed(3)} against ${r.bits.toFixed(3)}`);
    }
  }
  for (const [i, d] of drift.entries()) {
    // A drift is a fault when it is both significant (4 standard errors over the replicates) and material (2 points of
    // rate): a seeded chain that has not forgotten its start biases that rung's row of the level matrix.
    if (d && Math.abs(d[1]) > 4 && Math.abs(d[0]) > 0.02) reasons.push(`rung ${i}: chain not equilibrated (rate into rung ${i + 1} moved ${(d[0] * 100).toFixed(1)} points between the halves of its samples, ${d[1].toFixed(1)} standard errors)`);
  }
  if (status === "converged" && reasons.length) status = "flagged";
  const distinctLevels = Array.from({ length: layers }, (_, j) => (singleSite ? distinct[j]!.size : null));
  distinctLevels.forEach((d, j) => {
    if (d !== null && d < cfg.minLevels) {
      reasons.push(`layer ${j} (${ruleLayers(family, tb)[j]!.id}) takes ${d} distinct values, fewer than ${cfg.minLevels}: too coarse to extend the ladder`);
      status = "too-coarse";   // a design fault, whatever the budget did
    }
  });
  return { status, reasons, rungs: rungsOut, reversibility: flow > 0 ? circ / flow : 0, mixingSteps: result.mixing, samplesPerChain: N, steps, distinctLevels, levelMatrix: st.pooled, drift, convergedThrough: st.through,
    examples: reps[0]!.chains.map(c => type.encode(c.state)) };
}
