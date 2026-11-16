/**
 * Full House, ported from v1's full_house (archive/engine-v1 lib/game-utilities/src/families/grid/games.ts): each row
 * (or column) is a poker hand, and every pair of cells in it holding the same number counts (three of a kind makes 3
 * pairs, four of a kind 6). v1 scored that count alone; v2 keeps it as the main part and adds three tie-breakers on the
 * pairs it counts (the engine deals a rule with one): the paired numbers' size, how many different numbers pair, and
 * how far apart the paired cells sit.
 */
import type { RuleFamily } from "@workspace/v2-core";
import type { GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { family, more, readCells, term, markFor, type Shape } from "./family-kit.ts";

export type HouseAxis = "rows" | "columns";
type House = { axis: HouseAxis };
const one = (p: House) => (p.axis === "rows" ? "row" : "column");

export function fullHouse(n: number): RuleFamily<GridState, House> {
  const shape: Shape<House> = {
    main: more<House>("pairs", "pairs of equal numbers in a row (or column)",
      p => `Make poker hands: look along each ${one(p)}. Every pair of cells in it holding the same number counts 1. Three of a kind makes 3 pairs, and four of a kind makes 6. More is better.`, "cells"),
    tieBreakers: [
      more<House>("pair-values", "the paired numbers, added up once per pair",
        "The pairs should be made of numbers as big as possible: add up each pair's number (a pair of 7s adds 7).", "cells"),
      more<House>("pair-kinds", "different numbers that make a pair", p => `As many different numbers as possible should make a pair in some ${one(p)}.`, "cells"),
      more<House>("pairs-apart", "how far apart the paired cells sit, added up",
        p => `The two cells of each pair should sit as far apart in their ${one(p)} as possible: add up the steps between them (side by side is 1, the two ends are ${n - 1}).`, "cells"),
    ],
  };
  return family<House>("full-house", "Full House", ["cells"], shape, [{ axis: "rows" }, { axis: "columns" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const hands = p.axis === "rows" ? rows(n) : cols(n);
    const found: { a: number; b: number; gap: number }[] = [];   // every pair: its two cells and the steps between them
    for (const h of hands) for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++)
      if (cells.v[h[i]!] === cells.v[h[j]!]) found.push({ a: h[i]!, b: h[j]!, gap: j - i });
    term(ctx, "pairs", `pairs of equal numbers in a ${one(p)}`, found.length, cells.refs);
    for (const i of new Set(found.flatMap(x => [x.a, x.b]))) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    const paired = [...new Set(found.flatMap(x => [x.a, x.b]))].map(i => cells.refs[i]!);
    for (const id of ["pair-values", "pair-kinds", "pairs-apart"]) markFor(ctx, id, paired);
    term(ctx, "pair-values", "the paired numbers, added up once per pair", found.reduce((t, x) => t + cells.v[x.a]!, 0), cells.refs);
    term(ctx, "pair-kinds", "different numbers that make a pair", new Set(found.map(x => cells.v[x.a])).size, cells.refs);
    term(ctx, "pairs-apart", "steps between the paired cells, added up", found.reduce((t, x) => t + x.gap, 0), cells.refs);
  }, n);
}
