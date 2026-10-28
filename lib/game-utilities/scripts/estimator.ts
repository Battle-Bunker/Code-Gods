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
 *  Exact mode: domains of at most EXACT_DOMAIN values (Int ranges) are enumerated outright.
 *
 * Determinism: one seeded Rng per table, seeded from the table key; nothing else is random. Bits are rounded to
 * 1e-9 (well below MIN_STEP_BITS), so output bytes do not depend on last-ulp differences between machines.
 */
import { objectType, seededRng, type Instantiation, type ObjectValue, type Rng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import {
  ESTIMATOR, EXACT_TAILS, MIN_SLOPE_BITS, MIN_STEP_BITS, SLOPE_LEVELS, cmpOrdinal, ordinalDistance, penaltyMeanBits, tableKey,
  type CalibrationBudget, type CalibrationTable,
} from "../src/calibration.ts";
import type { Ordinal, Params } from "../src/types.ts";
import { exactLevels } from "./exact.ts";

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
 * Builds the table for (family, canonical params, instantiation). Deterministic: the key seeds the Rng, so the
 * same key and budget give the same table, byte for byte.
 */
export function buildTable(familyId: string, params: Params, inst: Instantiation, budget: CalibrationBudget = DEFAULT_BUDGET,
  options: { exact?: boolean } = {}): BuildResult {
  const t0 = performance.now();
  const f = family(familyId), ctx = context(inst), T = objectType(inst.objectType), codec = T.codec(inst);
  const key = tableKey(familyId, params, inst);
  const seed = key.slice(0, 16);
  const rng: Rng = seededRng(BigInt(`0x${seed}`));
  const ev = evaluator({ familyId, params }, inst);
  let evaluations = 0;
  const score = (v: unknown): Ordinal => { evaluations++; return ev(codec.encode(v)); };
  const cmp = cmpOrdinal;

  const levels: Ordinal[] = [], log2p: number[] = [], vars: number[] = [];
  let mcLevels = 0, splitLevels = 0, stoppedEarly = false, exactMode = false;
  const domain = options.exact === false ? null : enumerate(inst);
  const exactTail = options.exact === false || inst.objectType !== "Grid" ? null : exactLevels(familyId, params, inst);
  let budgetLabel: CalibrationTable["estimator"]["budget"] = budget;

  if (exactTail) {
    exactMode = true;
    budgetLabel = `exact:${EXACT_TAILS[familyId]}`;
    for (const [o, l] of exactTail) { levels.push(o); log2p.push(l); vars.push(0); }
    mcLevels = levels.length;
  } else if (domain) {
    budgetLabel = "exact";
    exactMode = true;
    const ords = domain.map(w => { evaluations++; return ev(w); });
    const sorted = ords.slice().sort(cmp), n = sorted.length;
    for (let i = 0; i < n; i++) {
      if (i > 0 && cmp(sorted[i], sorted[i - 1]) === 0) continue;
      levels.push(sorted[i]); log2p.push(Math.log2((n - i) / n)); vars.push(0);
    }
    mcLevels = levels.length;
  } else {
    // 1. Body.
    const n = budget.nMc;
    const samples: Particle[] = [];
    for (let i = 0; i < n; i++) { const v = T.spawn(inst, rng); samples.push({ v, o: score(v) }); }
    const sorted = samples.map(s => s.o).sort(cmp);
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
    mcLevels = levels.length;
    let level = levels[k0], log2Level = log2p[k0], varLevel = vars[k0];

    // 2. Tail: initial particles from μ|{u ≥ ℓ₀}.
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (cmp(samples[i].o, level) >= 0) idx.push(i);
    const npart = budget.particles, steps = Math.max(4, Math.ceil(budget.sweeps * kernelSize(inst)));
    let parts: Particle[];
    let presteps = 0;
    if (idx.length >= npart) {
      for (let i = 0; i < npart; i++) { const j = i + rng.int(idx.length - i); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      parts = idx.slice(0, npart).map(i => ({ ...samples[i] }));
    } else {
      parts = Array.from({ length: npart }, () => ({ ...samples[idx[rng.int(idx.length)]] }));
      presteps = Math.ceil(2 * kernelSize(inst));
    }
    samples.length = 0;
    const mcmc = (lev: Ordinal, k: number) => {
      for (const p of parts) {
        for (let s = 0; s < k; s++) {
          const y = T.propose(p.v, inst, rng), o = score(y);
          if (cmp(o, lev) >= 0) { p.v = y; p.o = o; }
        }
      }
    };
    if (presteps) mcmc(level, presteps);

    const tl: Ordinal[] = [], tp: number[] = [], tv: number[] = [];
    let stuck = 0;
    for (let stage = 0; stage < budget.maxStages; stage++) {
      if (-log2Level >= budget.targetBits) break;
      // Distinct particle values above the level, with survival fractions.
      const vals = parts.map(p => p.o).sort(cmp);
      const w: Ordinal[] = [], frac: number[] = [];
      for (let i = 0; i < vals.length; i++) {
        if (cmp(vals[i], level) <= 0 || (i > 0 && cmp(vals[i], vals[i - 1]) === 0)) continue;
        w.push(vals[i]); frac.push((vals.length - i) / vals.length);
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
      const alive = parts.filter(p => cmp(p.o, level) >= 0);
      parts = parts.map(p => (cmp(p.o, level) >= 0 ? p : { ...alive[rng.int(alive.length)] }));
      mcmc(level, steps);
    }
    stoppedEarly = -log2Level < budget.targetBits;
    // Deepest population: its remaining distinct values.
    const vals = parts.map(p => p.o).sort(cmp);
    for (let i = 0; i < vals.length; i++) {
      if (cmp(vals[i], level) <= 0 || (i > 0 && cmp(vals[i], vals[i - 1]) === 0)) continue;
      const fj = (vals.length - i) / vals.length;
      tl.push(vals[i]); tp.push(log2Level + Math.log2(fj)); tv.push(varLevel + (1 - fj) / (fj * npart) / LN2 ** 2);
    }
    splitLevels = tl.length;
    levels.push(...tl); log2p.push(...tp); vars.push(...tv);
  }

  // Sort (stable), dedupe keeping the deepest-stage estimate, inflate splitting se.
  const order = levels.map((_, i) => i).sort((a, b) => cmp(levels[a], levels[b]) || a - b);
  const lvAll: Ordinal[] = [], lp: number[] = [], se: number[] = [];
  for (let j = 0; j < order.length; j++) {
    const i = order[j];
    if (j + 1 < order.length && cmp(levels[order[j + 1]], levels[i]) === 0) continue;
    lvAll.push(levels[i]); lp.push(log2p[i]); se.push(Math.sqrt(vars[i]) * (i >= mcLevels ? SE_INFLATION : 1));
  }
  const { levels: lv, bits } = thin(lvAll, strictBits(lp, se).map(round9));
  for (let i = 1; i < bits.length; i++) if (!(bits[i] > bits[i - 1])) throw new Error("internal: bits not strictly increasing");
  const top = bits.length - 1, back = Math.max(0, top - SLOPE_LEVELS);
  const fit = top > back ? (bits[top] - bits[back]) / ordinalDistance(lv[back], lv[top]) : 0;
  const slope = round9(Math.max(MIN_SLOPE_BITS, fit));

  let topReached: boolean | null = null;
  if (f.exemplar) {
    try {
      const ex = f.exemplar(params, ctx);
      topReached = cmp(ev(ex), lv[top]) <= 0;
    } catch { topReached = null; }
  }
  const frozenLevels = lv.map((o, i) => Object.freeze([typeof o === "number" ? o : Object.freeze([...o]), bits[i]] as const));
  const table: CalibrationTable = {
    key, family: familyId, canonicalParams: params, instance: inst.key, shape: f.shape(ctx),
    levels: frozenLevels, slope,
    ...(f.role === "penalty" ? { penaltyMeanBits: 0 } : {}),
    estimator: { id: ESTIMATOR.id, version: ESTIMATOR.version, seed, budget: budgetLabel },
    meta: { mcLevels, splitLevels, stoppedEarly: exactMode ? false : stoppedEarly, topReached, maxBits: bits[top] },
  };
  const out = f.role === "penalty" ? { ...table, penaltyMeanBits: round9(penaltyMeanBits(table)) } : table;
  return { table: out, seconds: (performance.now() - t0) / 1000, evaluations };
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
    estimator: {
      id: t.estimator.id, version: t.estimator.version, seed: t.estimator.seed,
      budget: typeof b === "string" ? b : {
        nMc: b.nMc, minMcCount: b.minMcCount, particles: b.particles, p0: b.p0, sweeps: b.sweeps,
        targetBits: b.targetBits, maxStages: b.maxStages, maxStuck: b.maxStuck,
      },
    },
    meta: {
      mcLevels: t.meta.mcLevels, splitLevels: t.meta.splitLevels, stoppedEarly: t.meta.stoppedEarly,
      topReached: t.meta.topReached, maxBits: t.meta.maxBits,
    },
  };
  return JSON.stringify(ordered);
}
