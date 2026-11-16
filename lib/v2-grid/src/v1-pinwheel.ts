/**
 * Pinwheel, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/geometry.ts, pinwheel): a quarter
 * turn moves the cells round in sets of 4; a set whose four cells hold one number is a primary point, and in each set
 * every cell holding the set's commonest number is a secondary point. v1 fixed the layer to the number (no params); its
 * secondary is the tie-breaker here.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { at, type GridState } from "./grid.ts";
import { family, more, readCells, term, markFor, type Shape } from "./family-kit.ts";

type None = Record<string, never>;

/** The cell a clockwise quarter turn takes cell i to: (r, c) to (c, N−1−r). */
export const quarterTurn = (n: number, i: number): number => at(n, i % n, n - 1 - Math.floor(i / n));

/** The sets of 4 a quarter turn moves round, each from its first cell in reading order (the middle cell of an odd board stays put and is left out). */
export function quarterSets(n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    const orbit = [i];
    while (orbit.length < 4) orbit.push(quarterTurn(n, orbit[orbit.length - 1]!));
    if (orbit[1] !== i && Math.min(...orbit) === i) out.push(orbit);
  }
  return out;
}

export function pinwheel(n: number): RuleFamily<GridState, None> {
  const sets = quarterSets(n);
  const shape: Shape<None> = {
    main: more<None>("pinwheel", "sets of 4 a quarter turn moves round, all holding the same number",
      `Try to make a quarter turn leave the board looking the same. Turn the board a quarter turn: the cells swap places in sets of 4${n % 2 ? ", and the middle cell stays put" : ""}. A set of 4 that all hold the same number scores 1 point.`, "cells"),
    tieBreakers: [
      more<None>("commonest", "cells holding their set's commonest number",
        "In each set of 4, every cell holding the set's commonest number scores 1 point (a set of four different numbers scores 1, a set of one number 4).", "cells"),
    ],
  };
  return family<None>("pinwheel", "Pinwheel", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    let full = 0, most = 0;
    for (const set of sets) {
      const keys = set.map(i => cells.v[i]!);
      const same = Math.max(...keys.map(k => keys.filter(x => x === k).length));
      most += same;
      const top = keys.find(k => keys.filter(x => x === k).length === same);
      markFor(ctx, "commonest", set.filter(i => cells.v[i] === top).map(i => cells.refs[i]!));   // the cells holding the set's commonest number
      if (same === 4) { full++; for (const i of set) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); }
    }
    term(ctx, "pinwheel", "sets of 4 a quarter turn moves round, all holding the same number", full, cells.refs);
    term(ctx, "commonest", "cells holding their set's commonest number, over the sets", most, cells.refs);
  }, n);
}
