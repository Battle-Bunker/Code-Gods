/**
 * TEMPORARY fallback for lib/game-utilities' calibration tables (see calibration.ts).
 *
 * Same signatures as lib/game-utilities/src/calibration.ts. Instead of shipped multilevel-splitting
 * tables it estimates the survival function G(t) = μ{u ≥ t} empirically from SAMPLES deterministic
 * spawns of the instantiation (seeded by the draw), memoised per draw. Surprisal is the bits of the
 * greatest level at or below the ordinal (non-decreasing), extrapolated above the top level. It caps
 * near log2(SAMPLES) bits: good enough to run and test games, not a calibration. Delete this file
 * once the real tables ship.
 */
import { softHinge } from "@workspace/game-core";
import {
  INT_PRESETS, STRING_PRESETS, objectType, seededRng, type Instantiation, type TypeArgs,
} from "@workspace/game-types";
import { compareOrdinals, context, evaluator, family, paramsKey, type Draw, type Ordinal } from "@workspace/game-utilities";

const SAMPLES = 2048;
const MIN_SLOPE_BITS = 0.05;

export interface CalibrationTable {
  readonly key: string;
  readonly family: string;
  readonly instance: string;
  /** [ordinal, bits], strictly increasing in both. */
  readonly levels: readonly (readonly [Ordinal, number])[];
  readonly slope: number;
  readonly penaltyMeanBits?: number;
}

const tables = new Map<string, CalibrationTable>();
const MAX_TABLES = 1024;

function lookup(table: CalibrationTable, ordinal: Ordinal): number {
  const L = table.levels;
  let lo = 0, hi = L.length - 1, i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (compareOrdinals(L[mid][0], ordinal) <= 0) { i = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (i < 0) return 0;
  const [top, bits] = L[i];
  if (i < L.length - 1 || compareOrdinals(top, ordinal) === 0) return bits;
  const steps = typeof top === "number" && typeof ordinal === "number" ? ordinal - top : 1;
  return bits + table.slope * steps;
}

export function surprisal(table: CalibrationTable, ordinal: Ordinal): number {
  return lookup(table, ordinal);
}

export function penaltyMeanBits(table: CalibrationTable): number {
  return table.penaltyMeanBits ?? 0;
}

export function tableFor(draw: Draw, inst: Instantiation): CalibrationTable | undefined {
  const f = family(draw.familyId);
  if (f.objectType !== inst.objectType) return undefined;
  const canonical = f.canonical(draw.params, context(inst));
  const key = `${inst.key}\0${draw.familyId}\0${paramsKey(canonical)}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const T = objectType(inst.objectType), codec = T.codec(inst), rng = seededRng(`fallback-calibration:${key}`);
  const score = evaluator({ familyId: draw.familyId, params: canonical }, inst);
  const ordinals: Ordinal[] = [];
  for (let i = 0; i < SAMPLES; i++) ordinals.push(score(codec.encode(T.spawn(inst, rng))));
  ordinals.sort(compareOrdinals);
  const levels: [Ordinal, number][] = [];
  for (let i = 0; i < ordinals.length; i++) {
    if (i > 0 && compareOrdinals(ordinals[i - 1], ordinals[i]) === 0) continue;
    levels.push([ordinals[i], -Math.log2((ordinals.length - i) / ordinals.length)]);
  }
  const n = levels.length;
  const slope = n >= 2 && typeof levels[n - 1][0] === "number" && typeof levels[Math.max(0, n - 5)][0] === "number"
    ? Math.max(MIN_SLOPE_BITS, (levels[n - 1][1] - levels[Math.max(0, n - 5)][1]) /
      Math.max(1, (levels[n - 1][0] as number) - (levels[Math.max(0, n - 5)][0] as number)))
    : 1;
  const base: CalibrationTable = { key, family: draw.familyId, instance: inst.key, levels, slope };
  const table: CalibrationTable = f.role === "penalty"
    ? { ...base, penaltyMeanBits: ordinals.reduce<number>((sum, o) => sum + softHinge(lookup(base, o)), 0) / ordinals.length }
    : base;
  if (tables.size >= MAX_TABLES) tables.delete(tables.keys().next().value!);
  tables.set(key, table);
  return table;
}

export function hasTable(draw: Draw, inst: Instantiation): boolean {
  return family(draw.familyId).objectType === inst.objectType;
}

const OFFERED: Readonly<Record<string, readonly TypeArgs[]>> = {
  Int: INT_PRESETS,
  string: STRING_PRESETS,
  Grid: [{ size: 5, symbols: "base10", colours: "rgby" }, { size: 4, symbols: "cards", colours: "rainbow6" }, { size: 3, symbols: "base10", colours: "rgb" }],
};

export function offeredInstantiations(objectTypeId: string): Instantiation[] {
  const T = objectType(objectTypeId);
  return (OFFERED[objectTypeId] ?? []).map(args => T.instantiate(args));
}
