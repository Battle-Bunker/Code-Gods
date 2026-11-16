/** The grid object type and its variants (docs/engine-v2/grids.md §1). */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { decodeGrid, encodeGrid, gridParams, inDomain, cellBits, type GridState } from "./grid.ts";
import { gridRepresentations } from "./representations.ts";
import { gridMutators } from "./mutators.ts";
import { gridFamilies } from "./families.ts";
import { gridPenalties } from "./defence.ts";

const MUTATORS = gridMutators(4).map(m => m.id);

/** The beginner board: 4×4, every cell 0–9, half a bit per unit. */
export const grid4: Variant = { id: "grid-4-d10", objectType: "grid", mutators: MUTATORS, birthMixSteps: 64, params: { size: 4, cap: 9, step: 0.5 } };
/** For tests only: 2×2, cells 0–2 (81 boards), so every exact value can be checked against all boards. */
export const grid2: Variant = { id: "grid-2-d3", objectType: "grid", mutators: MUTATORS, birthMixSteps: 16, params: { size: 2, cap: 2, step: 0.5 } };

/** The grid object type for N×N boards (representations, mutators and families name that size's cells). */
export function makeGridType(n: number, variants: readonly Variant[]): ObjectType<GridState> {
  // Two Pair and Strangers read each corner box as a 2×2 square, and the cards' "2, 3, 5 or 7" assume one digit a cell:
  // boards of side 2 (tests) and 4 only, until a wider variant generalises them.
  if (n !== 2 && n !== 4) throw new Error(`grid boards have side 2 or 4, not ${n}`);
  for (const v of variants) {
    if (gridParams(v).size !== n) throw new Error(`${v.id} is not ${n} × ${n}`);
    if (gridParams(v).cap > 9) throw new Error(`${v.id}: a cell holds one digit (cap at most 9)`);
  }
  return {
    id: "grid",
    version: 1,
    variants,
    canonical: (s, v) => inDomain(s, v),
    encode: encodeGrid,
    decode: decodeGrid,
    readLength: (s, v) => s.cells.reduce((t, x) => t + cellBits(x, v), 0),
    sites: () => 1,
    origin: v => ({ cells: Array(gridParams(v).size ** 2).fill(0) }),
    representations: gridRepresentations(n),
    mutators: gridMutators(n),
    families: gridFamilies(n),
    penalties: gridPenalties(n),
  };
}

export const gridType = makeGridType(4, [grid4]);
/** The 2×2 test board's type (not registered for play or valuation). */
export const gridType2 = makeGridType(2, [grid2]);
