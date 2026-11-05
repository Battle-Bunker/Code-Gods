/**
 * Hold rarity (docs/energy-model.md §8): payoff bits = −log2 P(U(x) ≥ u ∧ U(x′) ≥ u), x ~ the spawn prior and x′ = x after
 * m random mutations (m = the number of OTHER players; game-types noise.ts: each ∝ 2^(−C)). It is static rarity (the
 * shipped calibration table) plus the hold correction
 *
 *   hold(u, m) = −log2 P(U(x′) ≥ u | U(x) ≥ u),
 *
 * which this module estimates and looks up. One player (m = 0) has no correction.
 *
 * Estimator: adaptive multilevel splitting over the levels of U (the same kernel as the calibration estimator: the
 * type's μ-symmetric `propose`, accepted iff U stays ≥ the level). After each stage the particles are draws from
 * μ | U ≥ ℓ, so the share of them whose m-mutation noise still scores ≥ ℓ estimates P(hold | ≥ ℓ) at that level. A share
 * of 0 is floored at 1/(2N) (N particles), so hold bits are at most log2(2N).
 */
import { NOISE_VERSION, noise, objectType, seededRng, type Instantiation, type Rng } from "@workspace/game-types";
import { evaluator } from "../src/catalog.ts";
import { cmpOrdinal } from "../src/calibration.ts";
import { HOLD_ESTIMATOR, type HoldTable } from "../src/hold.ts";
export { HOLD_ESTIMATOR, holdBits, type HoldTable } from "../src/hold.ts";
import type { Ordinal, Params } from "../src/types.ts";
import { budgetFor, kernelSize } from "./estimator.ts";

export interface HoldBudget {
  readonly particles: number;
  /** Stop climbing once the static rarity of the level passes this many bits. */
  readonly targetBits: number;
  readonly p0: number;
  readonly maxStages: number;
  readonly maxStuck: number;
  /** Noise draws per particle per level (averaged). */
  readonly draws: number;
}
export const DEFAULT_HOLD_BUDGET: HoldBudget = Object.freeze({ particles: 400, targetBits: 40, p0: 0.5, maxStages: 80, maxStuck: 3, draws: 2 });
export const SMOKE_HOLD_BUDGET: HoldBudget = Object.freeze({ particles: 60, targetBits: 12, p0: 0.5, maxStages: 20, maxStuck: 2, draws: 1 });

/** The cache key part a hold table adds to its static table's key (the noise version invalidates it). */
export const holdKeyPart = (m: number) => `hold:${HOLD_ESTIMATOR.id}@${HOLD_ESTIMATOR.version}:m=${m}:${NOISE_VERSION}`;

/** Estimate the hold table of one draw at one m (m ≥ 1). Deterministic in `seed`. */
export function buildHoldTable(familyId: string, params: Params, inst: Instantiation, m: number, seed: string,
  budget: HoldBudget = DEFAULT_HOLD_BUDGET): HoldTable {
  if (!(Number.isInteger(m) && m >= 1)) throw new Error("hold tables are for m ≥ 1 (one player needs none)");
  const T = objectType(inst.objectType), codec = T.codec(inst), ev = evaluator({ familyId, params }, inst);
  const score = (v: unknown): Ordinal => ev(codec.encode(v));
  const rng: Rng = seededRng(`hold:${seed}`), nrng: Rng = seededRng(`hold-noise:${seed}`);
  const N = budget.particles, steps = Math.max(4, Math.ceil(budgetFor(inst.objectType).sweeps * kernelSize(inst)));
  let parts = Array.from({ length: N }, () => { const v = T.spawn(inst, rng); return { v, o: score(v) }; });
  const mcmc = (level: Ordinal, k: number) => {
    for (const p of parts) for (let s = 0; s < k; s++) {
      const y = T.propose(p.v, inst, rng), o = score(y);
      if (cmpOrdinal(o, level) >= 0) { p.v = y; p.o = o; }
    }
  };
  const holdAt = (level: Ordinal) => {
    let held = 0;
    for (const p of parts) for (let d = 0; d < budget.draws; d++) if (cmpOrdinal(score(noise(inst, p.v, m, nrng)), level) >= 0) held++;
    const frac = held / (N * budget.draws);
    return -Math.log2(Math.max(frac, 1 / (2 * N * budget.draws)));
  };
  const out: [Ordinal, number][] = [];
  const push = (level: Ordinal, bits: number) => {
    if (out.length && cmpOrdinal(out[out.length - 1][0], level) >= 0) return;
    out.push([level, bits]);
  };
  let level = parts.map(p => p.o).sort(cmpOrdinal)[0], log2Level = 0, stuck = 0;
  push(level, holdAt(level));
  for (let stage = 0; stage < budget.maxStages && -log2Level < budget.targetBits; stage++) {
    const vals = parts.map(p => p.o).sort(cmpOrdinal);
    let best = -1, bestFrac = 0;
    for (let i = 0; i < vals.length; i++) {
      if (cmpOrdinal(vals[i], level) <= 0 || (i > 0 && cmpOrdinal(vals[i], vals[i - 1]) === 0)) continue;
      const frac = (vals.length - i) / vals.length;
      if (best < 0 || Math.abs(Math.log(frac) - Math.log(budget.p0)) < Math.abs(Math.log(bestFrac) - Math.log(budget.p0))) { best = i; bestFrac = frac; }
    }
    if (best < 0) { if (++stuck > budget.maxStuck) break; mcmc(level, steps * 2); continue; }
    stuck = 0;
    level = vals[best];
    log2Level += Math.log2(bestFrac);
    const alive = parts.filter(p => cmpOrdinal(p.o, level) >= 0);
    parts = parts.map(p => (cmpOrdinal(p.o, level) >= 0 ? p : { ...alive[rng.int(alive.length)] }));
    mcmc(level, steps);
    push(level, holdAt(level));
  }
  return { m, levels: out, noise: NOISE_VERSION, estimator: { ...HOLD_ESTIMATOR, seed, particles: N } };
}
