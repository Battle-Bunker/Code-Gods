/**
 * Mixture priors: ρ = ½·uniform + ½·pool, where the pool is a frozen list of objects (e.g. grids from earlier
 * games, lib/grid-lab/docs/explore/priors.md). The tail is exact given the uniform table:
 *
 *   G_ρ(t) = ½·G_uniform(t) + ½·#{y ∈ pool : u(y) ≥ t} / |pool|
 *
 * so a mixture table needs no sampler: its levels are the uniform table's levels plus every distinct pool ordinal,
 * each with bits −log2 G_ρ (exact at every level, given the uniform estimate). Above the pool's best ordinal
 * G_ρ = ½·G_uniform, so the top level is one where the pool share is 0 and the extrapolation slope is the uniform
 * table's. Between levels the usual lookup interpolation applies.
 */
import { objectType, sha256, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { evaluator, family } from "../src/catalog.ts";
import {
  MIN_STEP_BITS, canonicalJson, cmpOrdinal, penaltyMeanBits, surprisal, tableKey, type CalibrationTable, type PriorRef,
} from "../src/calibration.ts";
import type { Ordinal } from "../src/types.ts";

/** A frozen pool file: `{ "id": "season-1", "instance": "Grid(5,base10,rgby)", "wires": [...] }`. */
export interface PriorPool {
  readonly id: string;
  readonly instance: string;
  readonly wires: readonly ObjectValue[];
}

export const MIXTURE_PRIOR_ID = "half-uniform-half-pool";
/** The ½-mixture compresses surprisal (G_ρ ≥ ½·G_uniform, and ≥ the pool share); 2 keeps magnitudes comparable. */
export const MIXTURE_DISPLAY_SCALE = 2;

/** The pool's content hash goes into the prior's version, hence into every table key. */
export function poolPrior(pool: PriorPool): PriorRef {
  const hash = sha256(canonicalJson({ instance: pool.instance, wires: pool.wires }));
  return { id: MIXTURE_PRIOR_ID, version: `${pool.id}:${hash}` };
}

export function validatePool(pool: PriorPool, inst: Instantiation): void {
  if (pool.instance !== inst.key) throw new Error(`pool ${pool.id} is for ${pool.instance}, not ${inst.key}`);
  if (!pool.wires.length) throw new Error(`pool ${pool.id} is empty`);
  const codec = objectType(inst.objectType).codec(inst);
  for (const w of pool.wires) if (!codec.isValid(w)) throw new Error(`pool ${pool.id}: ${JSON.stringify(w)} is not a ${inst.key} value`);
}

/** The smallest ordinal step above o: +1 (scalars) or +1 in the last component (tuples). */
const nextOrdinal = (o: Ordinal): Ordinal => (typeof o === "number" ? o + 1 : o.map((x, i) => (i === o.length - 1 ? x + 1 : x)));

const round9 = (x: number) => Math.round(x * 1e9) / 1e9;

/** The mixture table for the uniform table's draw. Deterministic (no randomness at all). */
export function mixtureTable(uniform: CalibrationTable, pool: PriorPool, inst: Instantiation): CalibrationTable {
  validatePool(pool, inst);
  if (uniform.prior) throw new Error("mixtureTable needs the uniform table");
  const prior = poolPrior(pool), f = family(uniform.family);
  const ev = evaluator({ familyId: uniform.family, params: uniform.canonicalParams }, inst);
  const ords = pool.wires.map(w => ev(w)).sort(cmpOrdinal), n = ords.length;
  const cand: Ordinal[] = [...uniform.levels.map(l => l[0]), ...ords].sort(cmpOrdinal)
    .filter((o, i, a) => i === 0 || cmpOrdinal(a[i - 1], o) !== 0);
  // If the pool reaches the top level, add the next ordinal above it, where the pool share is 0 and G_ρ = ½·G_uniform:
  // extrapolation from there at the uniform slope is then 1 + the uniform surprisal (exactly, for scalar ordinals).
  if (cmpOrdinal(ords[n - 1], cand[cand.length - 1]) === 0) cand.push(nextOrdinal(cand[cand.length - 1]));
  let j = 0, prev = 0;
  const levels = cand.map(t => {
    while (j < n && cmpOrdinal(ords[j], t) < 0) j++;
    const G = 0.5 * 2 ** -surprisal(uniform, t) + 0.5 * (n - j) / n;
    const bits = Math.max(round9(-Math.log2(G)), round9(prev + MIN_STEP_BITS));
    prev = bits;
    return Object.freeze([t, bits] as const);
  });
  const table: CalibrationTable = {
    key: tableKey(uniform.family, uniform.canonicalParams, inst, prior),
    family: uniform.family, canonicalParams: uniform.canonicalParams, instance: inst.key, shape: uniform.shape,
    levels, slope: uniform.slope,
    prior,
    estimator: uniform.estimator,
    meta: {
      ...uniform.meta, mcLevels: levels.length, splitLevels: 0, maxBits: levels[levels.length - 1][1],
      displayScale: MIXTURE_DISPLAY_SCALE, uniformKey: uniform.key, poolSize: n,
    },
  };
  return f.role === "penalty" ? { ...table, penaltyMeanBits: round9(penaltyMeanBits(table)) } : table;
}
