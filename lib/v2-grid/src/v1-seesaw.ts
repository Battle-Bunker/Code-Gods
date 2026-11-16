/**
 * Seesaw, ported from v1's seesaw (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts): every row (or
 * column) is a seesaw whose two sides are its left and right halves (top and bottom halves for columns), and it
 * balances when both sides add up to the same. v1 scored (balanced seesaws, −the gaps added up); v2's main part is the
 * gaps added up (a continuous distance, so v1's secondary is folded into it, as Magic Accountant's was), and three
 * tie-breakers on the seesaws it measures (the engine deals a rule with one): the other way balancing too, the
 * balanced seesaws' weight, and each seesaw's ends against its middle.
 */
import type { RuleFamily } from "@workspace/v2-core";
import type { GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { distance, family, more, readCells, sumOf, term, markFor, type Shape } from "./family-kit.ts";

export type SeesawAxis = "rows" | "columns";
type Seesaw = { axis: SeesawAxis };
const one = (p: Seesaw) => (p.axis === "rows" ? "row" : "column");
const sides = (p: Seesaw) => (p.axis === "rows" ? "left half and right half" : "top half and bottom half");

/** How far a seesaw's two halves are from balancing. */
const lean = (v: readonly number[], line: readonly number[]) => {
  const h = Math.floor(line.length / 2);
  return Math.abs(sumOf(line.slice(0, h).map(i => v[i]!)) - sumOf(line.slice(line.length - h).map(i => v[i]!)));
};

export function seesaw(n: number): RuleFamily<GridState, Seesaw> {
  const shape: Shape<Seesaw> = {
    main: distance<Seesaw>("seesaw", "how far each row (or column) is from balancing, added up",
      p => `Make every ${one(p)} balance like a seesaw: its two sides are its ${sides(p)}. Add up the numbers on each side; the gap between the two sides should be as small as possible, added up over the ${p.axis}.`, "cells"),
    tieBreakers: [
      distance<Seesaw>("other-way", "how far the other way is from balancing, added up",
        p => `The ${p.axis === "rows" ? "columns" : "rows"} should balance too (their ${p.axis === "rows" ? "top and bottom" : "left and right"} halves): their gaps added up, as small as possible.`, "cells"),
      more<Seesaw>("heavy-seesaws", "the balanced seesaws' numbers, added up",
        p => `The ${p.axis} that balance should be as heavy as possible: add up all their numbers.`, "cells"),
      distance<Seesaw>("ends-and-middle", "how far each seesaw's two ends are from its middle two, added up",
        p => `In each ${one(p)}, the two end numbers added up should equal the two middle numbers added up: the gaps added up, as small as possible.`, "cells"),
    ],
  };
  return family<Seesaw>("seesaw", "Seesaw", ["cells"], shape, [{ axis: "rows" }, { axis: "columns" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const lines = p.axis === "rows" ? rows(n) : cols(n), other = p.axis === "rows" ? cols(n) : rows(n);
    const leans = lines.map(l => lean(cells.v, l));
    term(ctx, "seesaw", `how far each ${one(p)}'s two halves are from balancing, added up`, sumOf(leans), cells.refs);
    lines.forEach((l, k) => { if (leans[k] === 0) for (const i of l) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); });
    const at = (ls: number[][], keep: (l: number[], k: number) => boolean) => ls.flatMap((l, k) => (keep(l, k) ? l.map(i => cells.refs[i]!) : []));
    markFor(ctx, "other-way", at(other, l => lean(cells.v, l) !== 0));   // the other way's unbalanced seesaws
    markFor(ctx, "heavy-seesaws", at(lines, (_, k) => leans[k] === 0));   // the balanced seesaws
    markFor(ctx, "ends-and-middle", at(lines, l => cells.v[l[0]!]! + cells.v[l[n - 1]!]! !== cells.v[l[1]!]! + cells.v[l[n - 2]!]!));   // ends off their middle
    term(ctx, "other-way", `how far each ${p.axis === "rows" ? "column" : "row"}'s two halves are from balancing, added up`, sumOf(other.map(l => lean(cells.v, l))), cells.refs);
    term(ctx, "heavy-seesaws", `the numbers in the ${p.axis} that balance, added up`, sumOf(lines.filter((_, k) => leans[k] === 0).map(l => sumOf(l.map(i => cells.v[i]!)))), cells.refs);
    term(ctx, "ends-and-middle", "how far each seesaw's ends are from its middle, added up",
      sumOf(lines.map(l => Math.abs(cells.v[l[0]!]! + cells.v[l[n - 1]!]! - cells.v[l[1]!]! - cells.v[l[n - 2]!]!))), cells.refs);
  }, n);
}
