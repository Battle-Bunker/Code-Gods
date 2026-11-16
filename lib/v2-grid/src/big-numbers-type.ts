/**
 * The big-numbers board (docs/engine-v2/grid-tuple-rules/): a 4×4 grid whose cells hold any whole number 0, 1, 2, …,
 * its own object type so the digit grid's law, values and encodings stay as they are (the grids session, 16 Nov).
 *
 * The law is a constant field on each cell, φ(v) = g·v^α + log2 Z (the gravity session's form; exponent α = 1 by
 * default): a cell holding v has probability 2^−φ(v), cells independent, and a board's read length is the sum. The grid's
 * moves are reused as they are: an add of k costs |k| units, and the confining surcharge (the growth of the read length)
 * is the field's price of height, g per unit of a cell at α = 1.
 */
import type { Invalid, ObjectType, Variant } from "@workspace/v2-core";
import { decodeGrid, encodeGrid, type GridState } from "./grid.ts";
import { gridRepresentations } from "./representations.ts";
import { gridMutators } from "./mutators.ts";
import { bigNumberFamilies } from "./big-numbers.ts";

export interface BigGridParams { readonly size: number; readonly g: number; readonly alpha: number }
/** No cap: the grid's mutators read `cap` for their domain check, so the variant states the largest safe whole number. */
const NO_CAP = Number.MAX_SAFE_INTEGER;

export function bigGridParams(v: Variant): BigGridParams {
  const p = v.params as Partial<BigGridParams>;
  return { size: p.size ?? 4, g: p.g ?? 0.25, alpha: p.alpha ?? 1 };
}

const zCache = new Map<string, number>();
/** log2 Z = log2 Σ_v 2^(−g·v^α) (closed form at α = 1; summed until the terms vanish otherwise). */
export function bigLog2Z(v: Variant): number {
  const { g, alpha } = bigGridParams(v), key = `${g}|${alpha}`;
  let z = zCache.get(key);
  if (z === undefined) {
    if (alpha === 1) z = -Math.log2(1 - 2 ** -g);
    else { let s = 0; for (let x = 0; ; x++) { const t = 2 ** (-g * x ** alpha); s += t; if (t < 1e-17 * s) break; } z = Math.log2(s); }
    zCache.set(key, z);
  }
  return z;
}
/** The bits to read one cell holding x: φ(x) = g·x^α + log2 Z. */
export const bigCellBits = (x: number, v: Variant): number => { const { g, alpha } = bigGridParams(v); return g * x ** alpha + bigLog2Z(v); };

export function bigInDomain(s: GridState, v: Variant): GridState | Invalid {
  const { size } = bigGridParams(v);
  if (s.cells.length !== size * size) return { invalid: `this board has ${size} × ${size} cells` };
  for (const x of s.cells) if (!Number.isSafeInteger(x) || x < 0) return { invalid: "a cell holds a whole number, 0 or more" };
  return s;
}

/** A cell drawn from the law: the inverse of its tail (α = 1: geometric). */
export function drawBigCell(v: Variant, unit: number): number {
  const { g, alpha } = bigGridParams(v);
  if (alpha === 1) return Math.floor(-Math.log2(1 - unit) / g) || 0;
  let u = unit, x = 0;
  for (; ; x++) { const p = 2 ** -bigCellBits(x, v); if (u < p) return x; u -= p; }
}

const MUTATORS = gridMutators(4).map(m => m.id);
/** The big-numbers board: 4×4, g = ¼ bit per unit (the lines' default field), α = 1. */
export const bigGrid4: Variant = { id: "grid-4-big", objectType: "grid-big", mutators: MUTATORS, birthMixSteps: 64, params: { size: 4, g: 0.25, alpha: 1, cap: NO_CAP } };

export const bigGridType: ObjectType<GridState> = {
  id: "grid-big",
  version: 1,
  variants: [bigGrid4],
  canonical: (s, v) => bigInDomain(s, v),
  encode: encodeGrid,
  decode: decodeGrid,
  readLength: (s, v) => s.cells.reduce((t, x) => t + bigCellBits(x, v), 0),
  sites: () => 1,
  origin: v => ({ cells: Array(bigGridParams(v).size ** 2).fill(0) }),
  representations: gridRepresentations(4),
  mutators: gridMutators(4),
  families: bigNumberFamilies(4),
};
