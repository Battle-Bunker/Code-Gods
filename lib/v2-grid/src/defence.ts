/**
 * Defence goals on the grid (v1, restored; owner-decisions call 1; archive lib/game-utilities/src/families/grid/
 * defence.ts and lib/grid-lab/docs/defence-goals.md). A penalty family's main part is badness, bigger is worse; a seat
 * dealt one beside its rule loses bits when an object is unusually bad for it (lib/v2-valuation defence.ts). Only v1's
 * penalties that need no colours are here (v2's grids are digit boards): Hated number and Number crowd. Hated patch,
 * Takeover, Big blobs, Matching corners and Repeats in the row read colours (v1 `requires: { minColours: 2 }`) and
 * return with the colour boards.
 */
import type { RuleFamily } from "@workspace/v2-core";
import type { GridState } from "./grid.ts";
import { countCells, family, more, readCells, term, type Shape } from "./family-kit.ts";

type ValueP = { value: number };
const hatedNumberShape: Shape<ValueP> = {
  main: more<ValueP>("hated", "cells showing the hated number", p => `Try to avoid ${p.value}. Each cell showing ${p.value} adds 1 point of badness.`, "cells"),
  tieBreakers: [],
};
/** Hated number: each cell showing the dealt number adds 1 badness (v1 hate_value; every digit is one orbit). */
const hatedNumber = (n: number) => family<ValueP>("hated-number", "Hated number", ["cells"], hatedNumberShape,
  Array.from({ length: 10 }, (_, value) => ({ value })),
  (ctx, p, size) => countCells(ctx, "hated", `cells showing ${p.value}`, readCells(ctx, size), x => x === p.value, true), n);

type None = Record<string, never>;
const crowdShape: Shape<None> = {
  main: more<None>("crowd", "copies of the commonest number", "Try to avoid one number taking over. Each copy of whichever number is commonest adds 1 point of badness.", "cells"),
  tieBreakers: [],
};
/** Number crowd: the count of the commonest number (v1 hate_symbol_takeover). */
const numberCrowd = (n: number) => family<None>("number-crowd", "Number crowd", ["cells"], crowdShape, [{}], (ctx, _p, size) => {
  const cells = readCells(ctx, size), counts = new Map<number, number>();
  for (const x of cells.v) counts.set(x, (counts.get(x) ?? 0) + 1);
  const most = Math.max(...counts.values());
  term(ctx, "crowd", `the commonest number appears ${most} times`, most, cells.refs);
}, n);

/** The grid's penalty families (ObjectType.penalties), for an n×n board. */
export const gridPenalties = (n: number): RuleFamily<GridState, any>[] => [hatedNumber(n), numberCrowd(n)];
