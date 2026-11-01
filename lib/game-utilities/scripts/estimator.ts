/**
 * The offline survival estimator (a TypeScript port of lib/grid-lab/gridlab/calibrate.py, estimator 3), generic
 * over object types: it only uses the type's `spawn` (μ), `propose` (symmetric MCMC moves), `codec` and the
 * trusted host `evaluator`, so the tables and live scores share one evaluator.
 *
 *  1. Body (Monte Carlo): `nMc` spawns. Every distinct ordinal with at least `minMcCount` samples at or above it
 *     becomes a level, p̂ = count / n.
 *  2. Tail (adaptive multilevel splitting): `particles` particles drawn from the MC samples above the deepest MC
 *     level ℓ₀ (exact draws from μ|{u ≥ ℓ₀}). Each stage picks the next level among distinct particle values > ℓ
 *     with survival fraction closest to p0 (log scale), records every distinct value in (ℓ, ℓ'], kills the
 *     particles below ℓ', clones random survivors and runs ceil(sweeps × kernel size) MCMC steps per particle:
 *     `propose`, accepted iff u stays ≥ ℓ' (Metropolis for μ|{u ≥ ℓ'}, since every proposal is symmetric under
 *     the uniform prior). Stops at `targetBits`, or after `maxStuck` rounds in which no particle could climb.
 *  3. Clean-up: weighted isotonic regression (weights 1/se²), then at least MIN_STEP_BITS between neighbours, so
 *     the bits are STRICTLY increasing. The extrapolation slope is fitted over the last SLOPE_LEVELS levels.
 *  Analytic mode: a family with an analytic survival function for the draw (src/analytic.ts, `analyticFor`) gets its
 *  levels verbatim (no sampling); otherwise domains of at most EXACT_DOMAIN values (Int ranges) are enumerated outright.
 *
 *  Split (on-demand latency, docs/analytic-calibration/architecture.md §3.2, §9.2): R replicates on 1/R of the spawns
 *  and particles each, run anywhere (`buildReplicate`) and merged in probability (`mergeReplicates`). A replicate's climb
 *  passes through levels fixed by its own pilot climb (an independent Rng), and starts just above its body's m-th
 *  largest sample, so each replicate is an unbiased estimate of G however few particles it has; the adaptive single run
 *  is not (its level choice biases it by O(1/particles), which a 1/R population would multiply by R).
 *
 * Determinism: one seeded Rng per table, seeded from the table key (and, for a split, the plan and the replicate);
 * nothing else is random. Bits are rounded to 1e-9 (well below MIN_STEP_BITS), so output bytes do not depend on last-ulp
 * differences between machines.
 */
import { objectType, seededRng, sha256, type Instantiation, type ObjectValue, type Rng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import {
  ESTIMATOR, MIN_SLOPE_BITS, MIN_STEP_BITS, SLOPE_LEVELS, analyticFor, cmpOrdinal, keyFromParts, ordinalDistance, penaltyMeanBits, tableKey, tableKeyParts,
  type CalibrationBudget, type CalibrationTable,
} from "../src/calibration.ts";
import type { Ordinal, Params } from "../src/types.ts";
import { assertAnalytic } from "../src/analytic.ts";

/** The shipped default (measured: 13–30 µs per Grid evaluation incl. encode + decode, 2–10 µs Int/string). */
export const DEFAULT_BUDGET: CalibrationBudget = Object.freeze({
  nMc: 1 << 15, minMcCount: 128, particles: 500, p0: 0.5, sweeps: 1, targetBits: 64, maxStages: 400, maxStuck: 3,
});
/**
 * Per-type defaults. Int and string evaluations are 5–10× cheaper than Grid ones, so their Monte Carlo body is
 * much deeper (2^20 / 2^18 samples): it resolves levels down to ~2^-13 / 2^-11 directly, below which a few
 * arithmetic families (Residue Oracle, Many-Faced) have level sets the splitting kernel cannot climb.
 */
export const TYPE_BUDGETS: Readonly<Record<string, CalibrationBudget>> = Object.freeze({
  Grid: DEFAULT_BUDGET,
  Int: Object.freeze({ ...DEFAULT_BUDGET, nMc: 1 << 20 }),
  string: Object.freeze({ ...DEFAULT_BUDGET, nMc: 1 << 18 }),
});
export const budgetFor = (objectType: string): CalibrationBudget => TYPE_BUDGETS[objectType] ?? DEFAULT_BUDGET;

/** Small budget for tests and smoke runs. */
export const SMOKE_BUDGET: CalibrationBudget = Object.freeze({
  nMc: 1 << 11, minMcCount: 32, particles: 64, p0: 0.5, sweeps: 0.5, targetBits: 24, maxStages: 100, maxStuck: 2,
});
export const BUDGETS: Readonly<Record<string, CalibrationBudget>> = { default: DEFAULT_BUDGET, smoke: SMOKE_BUDGET };

/** Domains with at most this many values are enumerated exactly. */
export const EXACT_DOMAIN = 1 << 20;
/** Correlation between cloned particles: splitting levels' se is inflated by this margin (calibrate.py). */
const SE_INFLATION = 1.6;
const LN2 = Math.LN2;
const round9 = (x: number) => Math.round(x * 1e9) / 1e9;

/** MCMC steps per particle per stage scale with this "dimension" of the type. */
export function kernelSize(inst: Instantiation): number {
  if (inst.objectType === "Grid") return inst.terms.cells;
  if (inst.objectType === "Int") return Math.max(1, (Number(inst.args.max) - Number(inst.args.min)).toString(2).length);
  if (inst.objectType === "string") return Math.max(1, Number(inst.args.maxLength));
  return 16;
}

/** Every value of a small finite domain (Int ranges), or null. */
function enumerate(inst: Instantiation): ObjectValue[] | null {
  if (inst.objectType !== "Int") return null;
  const min = Number(inst.args.min), max = Number(inst.args.max);
  if (max - min + 1 > EXACT_DOMAIN) return null;
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

/** Weighted pool-adjacent-violators: the closest non-decreasing sequence to y. */
function isotonic(y: readonly number[], w: readonly number[]): number[] {
  const vals: number[] = [], wts: number[] = [], cnt: number[] = [];
  for (let i = 0; i < y.length; i++) {
    vals.push(y[i]); wts.push(w[i]); cnt.push(1);
    while (vals.length > 1 && vals[vals.length - 2] > vals[vals.length - 1]) {
      const v2 = vals.pop()!, w2 = wts.pop()!, c2 = cnt.pop()!, j = vals.length - 1, tw = wts[j] + w2;
      vals[j] = (vals[j] * wts[j] + v2 * w2) / tw;
      wts[j] = tw; cnt[j] += c2;
    }
  }
  return vals.flatMap((v, i) => Array(cnt[i]).fill(v));
}

/** calibrate.py strict_bits: isotonic, then at least MIN_STEP_BITS between neighbours (and above 0). */
export function strictBits(log2p: readonly number[], se: readonly number[]): number[] {
  const b = log2p.map(x => -Math.min(x, 0));
  const w = se.map(s => 1 / Math.max(s, 1e-3) ** 2);
  const iso = b.length > 1 ? isotonic(b, w) : b;
  let prev = 0;
  return iso.map(x => (prev = Math.max(x, prev + MIN_STEP_BITS)));
}

/**
 * Thinning (bounded table size): drop level i when the next kept level would still be within THIN_BITS of the
 * last kept one. A dropped level lies between two kept levels whose bits differ by at most THIN_BITS, so the
 * interpolated lookup there is off by at most THIN_BITS (well below the estimator's statistical error). The first
 * and last levels are always kept.
 */
export const THIN_BITS = 0.1;
export function thin(levels: readonly Ordinal[], bits: readonly number[]): { levels: Ordinal[]; bits: number[] } {
  const keepL: Ordinal[] = [], keepB: number[] = [];
  let last = -Infinity;
  for (let i = 0; i < levels.length; i++) {
    const isEdge = i === 0 || i === levels.length - 1;
    if (isEdge || bits[i + 1] - last > THIN_BITS) { keepL.push(levels[i]); keepB.push(bits[i]); last = bits[i]; }
  }
  return { levels: keepL, bits: keepB };
}

interface Particle { v: unknown; o: Ordinal }

export interface BuildResult { readonly table: CalibrationTable; readonly seconds: number; readonly evaluations: number }

/**
 * A within-table split plan (architecture.md §3.2): the sampling estimator as `replicates` independent runs, replicate
 * r on its share of the budget (nMc/R spawns, minMcCount/R, particles/R) with its own seed and its own pilot-fixed
 * levels, merged by `mergeReplicates`. One replicate is the single run, byte for byte (adaptive levels, no pilot).
 */
export interface SplitPlan { readonly replicates: number }
export const SINGLE_RUN: SplitPlan = Object.freeze({ replicates: 1 });
/** A replicate climbs this many bits past targetBits, so the merged table (cut at the shallowest replicate) still reaches it. */
export const REPLICATE_MARGIN_BITS = 4;
/**
 * No replicate climbs with fewer particles than this: 500 particles allow 8 replicates. Measured (§9.2): at 8 replicates
 * of 62 particles the merged tables match or beat the single run up to 64 bits; at 12 of 41, extinctions past 48 bits
 * make the deep levels noisier.
 */
export const MIN_REPLICATE_PARTICLES = 62;
/**
 * Each replicate's pilot climb (its levels become the replicate's fixed levels, `climb`): this many particles, this
 * fraction of the replicate's sweeps. Only the level spacing depends on it, not the estimate's bias.
 */
export const PILOT_PARTICLES = 16;
export const PILOT_SWEEPS = 0.5;
/** The most replicates a budget allows. */
export const maxReplicates = (budget: CalibrationBudget): number => Math.max(1, Math.floor(budget.particles / MIN_REPLICATE_PARTICLES));

const share = (total: number, r: number, R: number) => Math.floor(total / R) + (r < total % R ? 1 : 0);
/** Replicate r's budget under a plan of R replicates: its share of the spawns and particles, the same body depth. */
export function replicateBudget(budget: CalibrationBudget, plan: SplitPlan, r: number): CalibrationBudget {
  const R = plan.replicates;
  if (R === 1) return budget;
  return {
    ...budget,
    nMc: share(budget.nMc, r, R),
    minMcCount: Math.max(2, Math.round(budget.minMcCount / R)),
    particles: share(budget.particles, r, R),
    targetBits: budget.targetBits + REPLICATE_MARGIN_BITS,
  };
}
/** Replicate r's seed: the single run's (the key's first 16 hex digits) for R = 1, else sha256(key, r, R). */
export const replicateSeed = (key: string, plan: SplitPlan, r: number): string =>
  plan.replicates === 1 ? key.slice(0, 16) : sha256(`${key}\0replicate\0${r}/${plan.replicates}`).slice(0, 16);

/**
 * Survival estimates at sampled ordinals, sorted by ordinal, one per ordinal: log2 Ĝ and its standard error in bits
 * (splitting levels already inflated by SE_INFLATION). What a replicate piece returns (JSON-safe).
 */
export interface Curve {
  readonly points: readonly (readonly [Ordinal, number, number])[];
  readonly mcLevels: number;
  readonly splitLevels: number;
  readonly stoppedEarly: boolean;
  /**
   * The climb ended at a fixed level no particle reached: the estimate past the curve's top is 0 (`mergeCurves` counts
   * it so). Otherwise a curve says nothing past its top.
   */
  readonly extinct?: boolean;
  /** The deepest body level (the climb's start), or null when the curve is exact. */
  readonly bodyTop: Ordinal | null;
}
export interface ReplicateResult {
  readonly replicate: number;
  readonly replicates: number;
  /** This replicate's share of the spawns (n_r / nMc): its weight in the merge. */
  readonly weight: number;
  readonly seed: string;
  readonly curve: Curve;
  readonly evaluations: number;
  readonly seconds: number;
  readonly bodySeconds: number;
  readonly stages: number;
}

/** Sort (stable), dedupe keeping the deepest-stage estimate, inflate the splitting levels' se. */
function sortedPoints(levels: readonly Ordinal[], log2p: readonly number[], vars: readonly number[], mcLevels: number): [Ordinal, number, number][] {
  const order = levels.map((_, i) => i).sort((a, b) => cmpOrdinal(levels[a], levels[b]) || a - b);
  const out: [Ordinal, number, number][] = [];
  for (let j = 0; j < order.length; j++) {
    const i = order[j];
    if (j + 1 < order.length && cmpOrdinal(levels[order[j + 1]], levels[i]) === 0) continue;
    out.push([levels[i], log2p[i], Math.sqrt(vars[i]) * (i >= mcLevels ? SE_INFLATION : 1)]);
  }
  return out;
}

interface Sampler {
  readonly inst: Instantiation;
  readonly T: ReturnType<typeof objectType>;
  readonly score: (v: unknown) => Ordinal;
  readonly evaluations: () => number;
}
function sampler(familyId: string, params: Params, inst: Instantiation): Sampler {
  const T = objectType(inst.objectType), codec = T.codec(inst), ev = evaluator({ familyId, params }, inst);
  let n = 0;
  return { inst, T, score: (v: unknown) => { n++; return ev(codec.encode(v)); }, evaluations: () => n };
}

/** A pilot climb (split replicates): its own Rng, particles and sweeps; the levels it chooses become the replicate's. */
interface Pilot { readonly rng: Rng; readonly particles: number; readonly sweeps: number }

/**
 * The Monte Carlo body and the splitting tail (module comment, steps 1–2) under one Rng. With a `pilot`, the climb's
 * levels are not chosen from its own particles: a pilot climb from the same start, on its own Rng, chooses them, and
 * the climb passes through those fixed levels (see `climb`).
 */
function sampleCurve(s: Sampler, budget: CalibrationBudget, rng: Rng, pilot?: Pilot): Curve & { bodySeconds: number; stages: number } {
  const { inst, T, score } = s, cmp = cmpOrdinal;
  const t0 = performance.now();
  const levels: Ordinal[] = [], log2p: number[] = [], vars: number[] = [];
  // 1. Body.
  const n = budget.nMc;
  const samples: Particle[] = [];
  for (let i = 0; i < n; i++) { const v = T.spawn(inst, rng); samples.push({ v, o: score(v) }); }
  const sorted = samples.map(x => x.o).sort(cmp);
  let k0 = -1;
  for (let i = 0; i < n; i++) {
    if (i > 0 && cmp(sorted[i], sorted[i - 1]) === 0) continue;
    const tail = n - i;
    if (tail < budget.minMcCount) break;
    const p = tail / n;
    levels.push(sorted[i]); log2p.push(Math.log2(p)); vars.push((1 - p) / (p * n) / LN2 ** 2);
    k0 = levels.length - 1;
  }
  if (k0 < 0) throw new Error(`minMcCount ${budget.minMcCount} exceeds nMc ${n}`);
  let mcLevels = levels.length;
  let start = { level: levels[k0], log2Level: log2p[k0], varLevel: vars[k0] };
  if (pilot) {
    // A replicate's body is small (minMcCount/R samples at its deepest level ℓ̂, the m-th largest). Starting the climb at
    // ℓ̂ with Ĝ(ℓ̂) = m/n overestimates what follows by m/(m − 1) (E[1/G(ℓ̂)] = n/(m − 1) for an order statistic);
    // starting just above it, at the next sampled value, with the count there (m − 1 without ties) does not (the
    // order-statistic start of generalised AMS).
    let i = n - 1;
    while (i >= 0 && cmp(sorted[i], start.level) > 0) i--;
    const above = n - 1 - i;
    if (above > 0) {
      const p = above / n;
      start = { level: sorted[i + 1], log2Level: Math.log2(p), varLevel: (1 - p) / (p * n) / LN2 ** 2 };
      levels.push(start.level); log2p.push(start.log2Level); vars.push(start.varLevel);
      mcLevels++;
    }
  }

  // 2. Tail: initial particles from μ|{u ≥ ℓ₀}.
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (cmp(samples[i].o, start.level) >= 0) idx.push(i);
  const seed = (npart: number, r: Rng, from: number[]): { parts: Particle[]; presteps: number } => {
    if (from.length >= npart) {
      for (let i = 0; i < npart; i++) { const j = i + r.int(from.length - i); [from[i], from[j]] = [from[j], from[i]]; }
      return { parts: from.slice(0, npart).map(i => ({ ...samples[i] })), presteps: 0 };
    }
    return { parts: Array.from({ length: npart }, () => ({ ...samples[from[r.int(from.length)]] })), presteps: Math.ceil(2 * kernelSize(inst)) };
  };
  let fixed: Ordinal[] | undefined;
  if (pilot) {
    const p = seed(pilot.particles, pilot.rng, idx.slice());
    fixed = climb(s, { ...budget, particles: pilot.particles, sweeps: pilot.sweeps }, pilot.rng, p.parts, p.presteps, start).chosen;
  }
  const { parts, presteps } = seed(budget.particles, rng, idx);
  samples.length = 0;
  const bodySeconds = (performance.now() - t0) / 1000;
  const c = climb(s, budget, rng, parts, presteps, start, fixed);
  levels.push(...c.levels); log2p.push(...c.log2p); vars.push(...c.vars);
  return {
    points: sortedPoints(levels, log2p, vars, mcLevels), mcLevels, splitLevels: c.levels.length, stoppedEarly: c.stoppedEarly,
    ...(c.extinct ? { extinct: true } : {}), bodyTop: start.level, bodySeconds, stages: c.stages,
  };
}

/**
 * Adaptive multilevel splitting from `start` (module comment, step 2): each stage's level is the distinct particle value
 * above the current level whose survival fraction is closest to p0. With `fixed` levels the stages pass through those
 * instead (each next fixed level above the current one; adaptive again past the last), which is plain multilevel
 * splitting: with levels that do not depend on the particles, the product of survival fractions is an unbiased estimate
 * of G for any number of particles (a Feynman–Kac normalising constant), however well the kernel mixes. A fixed level no
 * particle reaches is an extinction: the estimate past it is 0, and the climb ends.
 */
function climb(s: Sampler, budget: CalibrationBudget, rng: Rng, initial: Particle[], presteps: number,
  start: { level: Ordinal; log2Level: number; varLevel: number }, fixed?: readonly Ordinal[]) {
  const { inst, T, score } = s, cmp = cmpOrdinal;
  const npart = budget.particles, steps = Math.max(4, Math.ceil(budget.sweeps * kernelSize(inst)));
  let parts = initial, { level, log2Level, varLevel } = start;
  const mcmc = (lev: Ordinal, k: number) => {
    for (const p of parts) {
      for (let st = 0; st < k; st++) {
        const y = T.propose(p.v, inst, rng), o = score(y);
        if (cmp(o, lev) >= 0) { p.v = y; p.o = o; }
      }
    }
  };
  if (presteps) mcmc(level, presteps);

  const tl: Ordinal[] = [], tp: number[] = [], tv: number[] = [], chosen: Ordinal[] = [];
  let stuck = 0, stages = 0, extinct = false, f = 0;
  for (let stage = 0; stage < budget.maxStages; stage++) {
    if (-log2Level >= budget.targetBits) break;
    stages++;
    // Distinct particle values above the level, with survival fractions.
    const vals = parts.map(p => p.o).sort(cmp);
    const w: Ordinal[] = [], frac: number[] = [];
    for (let i = 0; i < vals.length; i++) {
      if (cmp(vals[i], level) <= 0 || (i > 0 && cmp(vals[i], vals[i - 1]) === 0)) continue;
      w.push(vals[i]); frac.push((vals.length - i) / vals.length);
    }
    while (fixed && f < fixed.length && cmp(fixed[f], level) <= 0) f++;
    if (fixed && f < fixed.length) {
      // The next fixed level: record the particle values below it, then its own survival fraction.
      const L = fixed[f++];
      let j = 0;
      for (; j < w.length && cmp(w[j], L) < 0; j++) { tl.push(w[j]); tp.push(log2Level + Math.log2(frac[j])); tv.push(varLevel + (1 - frac[j]) / (frac[j] * npart) / LN2 ** 2); }
      const alive = parts.filter(p => cmp(p.o, L) >= 0);
      if (!alive.length) { extinct = true; break; }
      const fk = alive.length / npart;
      tl.push(L); tp.push(log2Level + Math.log2(fk)); tv.push(varLevel + (1 - fk) / (fk * npart) / LN2 ** 2);
      log2Level += Math.log2(fk);
      varLevel += (1 - fk) / (fk * npart) / LN2 ** 2;
      level = L;
      parts = parts.map(p => (cmp(p.o, level) >= 0 ? p : { ...alive[rng.int(alive.length)] }));
      mcmc(level, steps);
      continue;
    }
    if (!w.length) {
      if (++stuck > budget.maxStuck) break;
      mcmc(level, steps * 2);
      continue;
    }
    stuck = 0;
    let k = 0;
    for (let j = 1; j < w.length; j++) {
      if (Math.abs(Math.log(frac[j]) - Math.log(budget.p0)) < Math.abs(Math.log(frac[k]) - Math.log(budget.p0))) k = j;
    }
    for (let j = 0; j <= k; j++) {
      tl.push(w[j]); tp.push(log2Level + Math.log2(frac[j])); tv.push(varLevel + (1 - frac[j]) / (frac[j] * npart) / LN2 ** 2);
    }
    const fk = frac[k];
    log2Level += Math.log2(fk);
    varLevel += (1 - fk) / (fk * npart) / LN2 ** 2;
    level = w[k];
    chosen.push(level);
    const alive = parts.filter(p => cmp(p.o, level) >= 0);
    parts = parts.map(p => (cmp(p.o, level) >= 0 ? p : { ...alive[rng.int(alive.length)] }));
    mcmc(level, steps);
  }
  const stoppedEarly = extinct || -log2Level < budget.targetBits;
  if (!extinct) {
    // Deepest population: its remaining distinct values.
    const vals = parts.map(p => p.o).sort(cmp);
    for (let i = 0; i < vals.length; i++) {
      if (cmp(vals[i], level) <= 0 || (i > 0 && cmp(vals[i], vals[i - 1]) === 0)) continue;
      const fj = (vals.length - i) / vals.length;
      tl.push(vals[i]); tp.push(log2Level + Math.log2(fj)); tv.push(varLevel + (1 - fj) / (fj * npart) / LN2 ** 2);
    }
  }
  return { levels: tl, log2p: tp, vars: tv, chosen, stoppedEarly, extinct, stages };
}

/** What a build produces before the clean-up: the curve, and how it was made. */
interface Raw {
  readonly key: string;
  readonly seed: string;
  readonly budgetLabel: CalibrationTable["estimator"]["budget"];
  readonly curve: Curve;
  readonly exactMode: boolean;
  readonly analytic: boolean;
  readonly split?: { readonly replicates: number };
}

/**
 * Builds the table for (family, canonical params, instantiation). Deterministic: the key seeds the Rng, so the
 * same key, budget and plan give the same table, byte for byte. A plan of R > 1 replicates runs them one after
 * another here; the engine runs them as separate actions (`buildReplicate`) and merges (`mergeReplicates`).
 */
export function buildTable(familyId: string, params: Params, inst: Instantiation, budget: CalibrationBudget = DEFAULT_BUDGET,
  options: { /** false: force the sampling estimator (reference tables for verifying an analytic). */ exact?: boolean; plan?: SplitPlan } = {}): BuildResult {
  const t0 = performance.now();
  const plan = options.plan ?? SINGLE_RUN;
  const analytic = options.exact === false ? null : analyticFor(familyId, params, inst);
  // The key of what this build produces: with the analytic id when the analytic is used, the estimator's key otherwise.
  const key = options.exact === false ? mcTableKey(familyId, params, inst) : tableKey(familyId, params, inst);
  const domain = options.exact === false || analytic ? null : enumerate(inst);
  if (analytic) {
    assertAnalytic(analytic, `${familyId} ${JSON.stringify(params)} on ${inst.key}`);   // reads the (possibly lazy) levels
    const v = analytic.kind === "approx" ? analytic.maxErrorBits! : 0;
    const points = sortedPoints(analytic.levels.map(([o]) => o), analytic.levels.map(([, l]) => l), analytic.levels.map(() => v * v), analytic.levels.length);
    const raw: Raw = { key, seed: key.slice(0, 16), budgetLabel: `${analytic.kind}:${analytic.id}`, analytic: true, exactMode: true,
      curve: { points, mcLevels: points.length, splitLevels: 0, stoppedEarly: false, bodyTop: null } };
    return { table: finishTable(familyId, params, inst, raw), seconds: (performance.now() - t0) / 1000, evaluations: 0 };
  }
  if (domain) {
    const ev = evaluator({ familyId, params }, inst);
    const ords = domain.map(w => ev(w));
    const sorted = ords.slice().sort(cmpOrdinal), n = sorted.length;
    const levels: Ordinal[] = [], log2p: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i > 0 && cmpOrdinal(sorted[i], sorted[i - 1]) === 0) continue;
      levels.push(sorted[i]); log2p.push(Math.log2((n - i) / n));
    }
    const points = sortedPoints(levels, log2p, levels.map(() => 0), levels.length);
    const raw: Raw = { key, seed: key.slice(0, 16), budgetLabel: "exact", analytic: false, exactMode: true,
      curve: { points, mcLevels: points.length, splitLevels: 0, stoppedEarly: false, bodyTop: null } };
    return { table: finishTable(familyId, params, inst, raw), seconds: (performance.now() - t0) / 1000, evaluations: n };
  }
  const reps = Array.from({ length: plan.replicates }, (_, r) => buildReplicate(familyId, params, inst, budget, plan, r, options));
  const table = mergeReplicates(familyId, params, inst, budget, plan, reps, options);
  return { table, seconds: (performance.now() - t0) / 1000, evaluations: reps.reduce((a, x) => a + x.evaluations, 0) };
}

/** Whether a draw is built by sampling (and can therefore be split): no analytic answer and no enumerable domain. */
export function isSampled(familyId: string, params: Params, inst: Instantiation): boolean {
  return !analyticFor(familyId, params, inst) && !enumerate(inst);
}

/**
 * Replicate r of a split build (a compute piece): the body and the climb on the replicate's budget and seed. Pure and
 * deterministic in (key, budget, plan, r).
 */
export function buildReplicate(familyId: string, params: Params, inst: Instantiation, budget: CalibrationBudget, plan: SplitPlan, r: number,
  options: { exact?: boolean } = {}): ReplicateResult {
  if (!Number.isInteger(plan.replicates) || plan.replicates < 1 || plan.replicates > maxReplicates(budget)) {
    if (plan.replicates !== 1) throw new Error(`a plan of ${plan.replicates} replicates is outside 1..${maxReplicates(budget)} for ${budget.particles} particles`);
  }
  if (!(r >= 0 && r < plan.replicates && Number.isInteger(r))) throw new Error(`replicate ${r} is outside 0..${plan.replicates - 1}`);
  const t0 = performance.now();
  const key = options.exact === false ? mcTableKey(familyId, params, inst) : tableKey(familyId, params, inst);
  const seed = replicateSeed(key, plan, r), b = replicateBudget(budget, plan, r);
  const s = sampler(familyId, params, inst);
  const pilot = plan.replicates > 1 ? { rng: seededRng(`${key}\0pilot\0${r}/${plan.replicates}`), particles: PILOT_PARTICLES, sweeps: PILOT_SWEEPS } : undefined;
  const { bodySeconds, stages, ...curve } = sampleCurve(s, b, seededRng(BigInt(`0x${seed}`)), pilot);
  return { replicate: r, replicates: plan.replicates, weight: b.nMc / budget.nMc, seed, curve, evaluations: s.evaluations(), seconds: (performance.now() - t0) / 1000, bodySeconds, stages };
}

/**
 * The split estimate from its replicates (architecture.md §3.2 "within a draw"). Each replicate's points define a step
 * function Ĝ_r(t) = Ĝ_r(smallest sampled ordinal ≥ t), unbiased for G(t) (Monte Carlo counts, and the adaptive splitting
 * estimator, are unbiased in probability). The merge averages in probability, weighted by each replicate's share of the
 * spawns, Ĝ(t) = Σ w_r Ĝ_r(t), at every sampled ordinal up to the shallowest replicate's top (beyond it some replicate
 * has no estimate, and keeping only the deeper ones would favour replicates that overestimate G). Where every replicate
 * is still in its body this is exactly the single run's body on nMc spawns (the counts add). The variance is pooled by
 * the delta method, var(log2 Ĝ) = Σ w_r² Ĝ_r² se_r² / Ĝ², which for R replicates of 1/R of the particles each equals the
 * single run's nominal variance. Then the single run's clean-up (isotonic, strict steps, thinning, slope).
 */
export function mergeReplicates(familyId: string, params: Params, inst: Instantiation, budget: CalibrationBudget, plan: SplitPlan,
  reps: readonly ReplicateResult[], options: { exact?: boolean } = {}): CalibrationTable {
  const R = plan.replicates;
  const key = options.exact === false ? mcTableKey(familyId, params, inst) : tableKey(familyId, params, inst);
  const byR = [...reps].sort((a, b) => a.replicate - b.replicate);
  if (byR.length !== R || byR.some((x, i) => x.replicate !== i || x.replicates !== R)) {
    throw new Error(`merge needs replicates 0..${R - 1} of a ${R}-way plan, got ${byR.map(x => `${x.replicate}/${x.replicates}`).join(", ")}`);
  }
  if (R === 1) {
    const raw: Raw = { key, seed: byR[0].seed, budgetLabel: budget, analytic: false, exactMode: false, curve: byR[0].curve };
    return finishTable(familyId, params, inst, raw);
  }
  const raw: Raw = { key, seed: key.slice(0, 16), budgetLabel: budget, analytic: false, exactMode: false, split: { replicates: R }, curve: mergeCurves(byR) };
  return finishTable(familyId, params, inst, raw);
}

/**
 * The merged curve of replicates (`mergeReplicates`, before the clean-up): at every sampled ordinal up to the merge's
 * top, Ĝ = Σ w_r Ĝ_r and se(log2 Ĝ) = √(Σ (w_r Ĝ_r se_r)²) / Ĝ. Replicate weights should sum to 1.
 */
export function mergeCurves(reps: readonly Pick<ReplicateResult, "weight" | "curve">[]): Curve {
  const cmp = cmpOrdinal, R = reps.length;
  const curves = reps.map(x => x.curve.points);
  if (!R || curves.some(c => !c.length)) throw new Error("a replicate returned no points");
  // How deep the merge goes. A replicate that did not go extinct has no estimate past its top: the shallowest such top
  // bounds the merge. An extinct one (no particle reached one of its fixed levels) estimates 0 past its top, and counts
  // as such. Only when every replicate went extinct does the deepest of them bound the merge.
  const tops = curves.map(c => c[c.length - 1][0]);
  const finishers = reps.map((_, r) => r).filter(r => !reps[r].curve.extinct);
  let top = tops[finishers.length ? finishers[0] : 0];
  if (finishers.length) { for (const r of finishers) if (cmp(tops[r], top) < 0) top = tops[r]; }
  else for (const t of tops) if (cmp(t, top) > 0) top = t;
  const all: Ordinal[] = [];
  for (const c of curves) for (const [o] of c) if (cmp(o, top) <= 0) all.push(o);
  all.sort(cmp);
  const ords: Ordinal[] = [];
  for (const o of all) if (!ords.length || cmp(ords[ords.length - 1], o) !== 0) ords.push(o);
  const at = curves.map(() => 0), w = reps.map(x => x.weight);
  const points: [Ordinal, number, number][] = [];
  for (const o of ords) {
    let g = 0, v = 0;
    for (let r = 0; r < R; r++) {
      const c = curves[r];
      if (cmp(tops[r], o) < 0) continue;   // extinct below o: contributes 0
      while (cmp(c[at[r]][0], o) < 0) at[r]++;   // first point ≥ o
      const [, l, se] = c[at[r]], gr = 2 ** l;
      g += w[r] * gr; v += (w[r] * gr * se) ** 2;
    }
    points.push([o, Math.log2(g), Math.sqrt(v) / g]);
  }
  // Levels at or below every replicate's body top are Monte Carlo levels (the body on all the spawns).
  let bodyTop: Ordinal | null = reps[0].curve.bodyTop;
  for (const x of reps) if (bodyTop !== null && x.curve.bodyTop !== null && cmp(x.curve.bodyTop, bodyTop) < 0) bodyTop = x.curve.bodyTop;
  const mcLevels = bodyTop === null ? points.length : points.filter(([o]) => cmp(o, bodyTop!) <= 0).length;
  return { points, mcLevels, splitLevels: points.length - mcLevels, stoppedEarly: reps.some(x => x.curve.stoppedEarly), bodyTop };
}

// ------------------------------------------------------------------------------------------------
// planning a split: what a table costs here, and how many pieces keep each one short
// ------------------------------------------------------------------------------------------------

export interface CostEstimate {
  /** Evaluations a single run makes: the body's spawns and the climb's proposals (`expectedEvaluations`). */
  readonly spawns: number;
  readonly proposals: number;
  /** Measured here, after a warm-up: microseconds per evaluated spawn and per evaluated proposal (encode included). */
  readonly usPerSpawn: number;
  readonly usPerProposal: number;
  /** The single run's expected build time on this machine. */
  readonly seconds: number;
}

/**
 * The single run's expected evaluations: the body's spawns, then a climb of one stage per −log2 p0 bits from the body's
 * depth (log2(nMc / minMcCount)) to targetBits plus the replicate margin, each stage moving every particle ceil(sweeps ×
 * kernel size) steps. An upper estimate when the climb stops early (an extinct or capped climb).
 */
export function expectedEvaluations(inst: Instantiation, budget: CalibrationBudget): { spawns: number; proposals: number } {
  const steps = Math.max(4, Math.ceil(budget.sweeps * kernelSize(inst)));
  const bodyBits = Math.log2(budget.nMc / budget.minMcCount);
  const stages = Math.max(0, budget.targetBits + REPLICATE_MARGIN_BITS - bodyBits) / -Math.log2(budget.p0);
  return { spawns: budget.nMc, proposals: Math.round(budget.particles * steps * (stages + 2)) };
}

/**
 * Measures the draw's evaluation cost where it runs (a cloud action is several times slower than a laptop, and
 * families differ tenfold: an Int family that factorises costs 40 µs, a digit count 2 µs): `samples` evaluations of
 * spawned values and as many of a proposal chain, each after a warm-up of as many. Deterministic values; tens of
 * milliseconds of work.
 */
export function estimateCost(familyId: string, params: Params, inst: Instantiation, budget: CalibrationBudget, samples = 400): CostEstimate {
  const s = sampler(familyId, params, inst), rng = seededRng(`cost:${familyId}:${inst.key}`);
  const time = (step: () => void) => {
    for (let i = 0; i < samples; i++) step();
    const t0 = performance.now();
    for (let i = 0; i < samples; i++) step();
    return ((performance.now() - t0) * 1000) / samples;
  };
  const usPerSpawn = time(() => { s.score(s.T.spawn(inst, rng)); });
  let v = s.T.spawn(inst, rng);
  const usPerProposal = time(() => { v = s.T.propose(v, inst, rng); s.score(v); });
  const { spawns, proposals } = expectedEvaluations(inst, budget);
  return { spawns, proposals, usPerSpawn, usPerProposal, seconds: (spawns * usPerSpawn + proposals * usPerProposal) / 1e6 };
}

/**
 * How many replicates a table needs so that each piece takes about `pieceSeconds` (never more than the budget allows,
 * maxReplicates); a table under `pieceSeconds` stays one piece (a split adds an action start and a merge).
 */
export function planSplit(cost: CostEstimate, budget: CalibrationBudget, pieceSeconds: number): SplitPlan {
  const R = Math.min(maxReplicates(budget), Math.max(1, Math.ceil(cost.seconds / pieceSeconds)));
  return R === 1 ? SINGLE_RUN : { replicates: R };
}

/** Step 3 (the clean-up) and the table record. */
function finishTable(familyId: string, params: Params, inst: Instantiation, raw: Raw): CalibrationTable {
  const f = family(familyId), ctx = context(inst), cmp = cmpOrdinal;
  const lvAll = raw.curve.points.map(p => p[0]), lp = raw.curve.points.map(p => p[1]), se = raw.curve.points.map(p => p[2]);
  // Analytic levels are kept whole (each is exact; the family decides how many it lists); sampled ones are thinned.
  const strict = strictBits(lp, se).map(round9);
  const { levels: lv, bits } = raw.analytic ? { levels: lvAll, bits: strict } : thin(lvAll, strict);
  for (let i = 1; i < bits.length; i++) if (!(bits[i] > bits[i - 1])) throw new Error("internal: bits not strictly increasing");
  const top = bits.length - 1, back = Math.max(0, top - SLOPE_LEVELS);
  const fit = top > back ? (bits[top] - bits[back]) / ordinalDistance(lv[back], lv[top]) : 0;
  const slope = round9(Math.max(MIN_SLOPE_BITS, fit));

  let topReached: boolean | null = null;
  if (f.exemplar) {
    try {
      const ex = f.exemplar(params, ctx);
      topReached = cmp(evaluator({ familyId, params }, inst)(ex), lv[top]) <= 0;
    } catch { topReached = null; }
  }
  const frozenLevels = lv.map((o, i) => Object.freeze([typeof o === "number" ? o : Object.freeze([...o]), bits[i]] as const));
  const table: CalibrationTable = {
    key: raw.key, family: familyId, canonicalParams: params, instance: inst.key, shape: f.shape(ctx),
    levels: frozenLevels, slope,
    ...(f.role === "penalty" ? { penaltyMeanBits: 0 } : {}),
    estimator: { id: ESTIMATOR.id, version: ESTIMATOR.version, seed: raw.seed, budget: raw.budgetLabel, ...(raw.split ? { split: raw.split } : {}) },
    meta: {
      mcLevels: raw.curve.mcLevels, splitLevels: raw.curve.splitLevels, stoppedEarly: raw.exactMode ? false : raw.curve.stoppedEarly,
      topReached, maxBits: bits[top],
    },
  };
  return f.role === "penalty" ? { ...table, penaltyMeanBits: round9(penaltyMeanBits(table)) } : table;
}

/**
 * The key a pure sampling build of this draw has: the current key without the analytic id (what the archived reference
 * tables of a family that has since gained an analytic are keyed by).
 */
export function mcTableKey(familyId: string, params: Params, inst: Instantiation): string {
  const { exact: _exact, ...parts } = tableKeyParts(familyId, params, inst);
  return keyFromParts(parts);
}

// ------------------------------------------------------------------------------------------------
// serialisation (stable key order, one table per line)
// ------------------------------------------------------------------------------------------------

function sortDeep(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortDeep(o[k])]));
  }
  return x;
}

/** One table as compact JSON with a fixed field order. */
export function tableJson(t: CalibrationTable): string {
  const b = t.estimator.budget;
  const ordered = {
    key: t.key, family: t.family, canonicalParams: sortDeep(t.canonicalParams), instance: t.instance, shape: t.shape,
    levels: t.levels, slope: t.slope,
    ...(t.penaltyMeanBits !== undefined ? { penaltyMeanBits: t.penaltyMeanBits } : {}),
    ...(t.prior ? { prior: { id: t.prior.id, version: t.prior.version } } : {}),
    estimator: {
      id: t.estimator.id, version: t.estimator.version, seed: t.estimator.seed,
      budget: typeof b === "string" ? b : {
        nMc: b.nMc, minMcCount: b.minMcCount, particles: b.particles, p0: b.p0, sweeps: b.sweeps,
        targetBits: b.targetBits, maxStages: b.maxStages, maxStuck: b.maxStuck,
      },
      ...(t.estimator.split ? { split: { replicates: t.estimator.split.replicates } } : {}),
    },
    meta: {
      mcLevels: t.meta.mcLevels, splitLevels: t.meta.splitLevels, stoppedEarly: t.meta.stoppedEarly,
      topReached: t.meta.topReached, maxBits: t.meta.maxBits,
      ...(t.meta.displayScale !== undefined ? { displayScale: t.meta.displayScale } : {}),
      ...(t.meta.uniformKey !== undefined ? { uniformKey: t.meta.uniformKey } : {}),
      ...(t.meta.poolSize !== undefined ? { poolSize: t.meta.poolSize } : {}),
    },
  };
  return JSON.stringify(ordered);
}
