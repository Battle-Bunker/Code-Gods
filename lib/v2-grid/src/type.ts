/** The grid object type and its variants (docs/engine-v2/grids.md §1). */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { decodeGrid, encodeGrid, gridParams, inDomain, cellBits, type GridState } from "./grid.ts";
import { gridRepresentations } from "./representations.ts";
import { gridMutators } from "./mutators.ts";
import { dynamicGridFamilies, type GridDynamicRule } from "./dynamic-families.ts";
import { estimateGrid } from "./energy.ts";
import { gridPenalties } from "./defence.ts";

const MUTATORS = gridMutators(4).map(m => m.id);

/** The beginner board: 4×4, every cell 0–9, half a bit per unit. */
export const grid4: Variant = { id: "grid-4-d10", objectType: "grid", mutators: MUTATORS, birthMixSteps: 64, params: { size: 4, cap: 9, step: 0.5 } };
/** For tests only: 2×2, cells 0–2 (81 boards), so the law and the moves' potential can be checked on every board. */
export const grid2: Variant = { id: "grid-2-d3", objectType: "grid", mutators: MUTATORS, birthMixSteps: 16, params: { size: 2, cap: 2, step: 0.5 } };

/** The grid object type for N×N boards (representations, mutators and families name that size's cells). */
export function makeGridType(n: number, variants: readonly Variant[]): ObjectType<GridState> {
  // The rules read rows, columns and corner boxes as four-digit numbers and Adding Rows names four lines: they are the
  // 4 × 4 board's; the 2 × 2 test board has none.
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
    // Every grid rule is scored by the dynamic energy measure (owner decision 50; energy.ts).
    estimate: (state, variant, rule, params, opts) => estimateGrid(state, rule as GridDynamicRule<unknown>, params, variant, opts),
    families: n === 4 ? [...dynamicGridFamilies] : [],
    penalties: gridPenalties(n),
  };
}

export const gridType = makeGridType(4, [grid4]);
/** The 2×2 test board's type (not registered for play). */
export const gridType2 = makeGridType(2, [grid2]);
