/**
 * Snap!, ported from v1's snap (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts): every pair of
 * side-by-side cells (across or down) holding the same number is a snap. v1 scored the count alone; v2 keeps it as the
 * main part and adds three tie-breakers on the snaps it counts (the engine deals a rule with one): the snapped numbers'
 * size, how many different numbers snap, and how many rows and columns the snaps reach.
 */
import type { RuleFamily } from "@workspace/v2-core";
import type { GridState } from "./grid.ts";
import { family, more, readCells, term, type Shape } from "./family-kit.ts";

type None = Record<string, never>;

export function snap(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("snaps", "touching pairs of equal numbers",
      "Put cells holding the same number side by side and shout Snap! for each pair: every two touching cells (across or down) holding the same number count 1. More is better.", "cells"),
    tieBreakers: [
      more<None>("snap-values", "the snapped numbers, added up once per snap",
        "The snaps should be made of numbers as big as possible: add up each snap's number (a snap of two 6s adds 6).", "cells"),
      more<None>("snap-kinds", "different numbers that snap", "As many different numbers as possible should make a snap.", "cells"),
      more<None>("snap-reach", "rows and columns holding a snapped cell",
        "The snaps should reach as many rows and columns as possible: count the rows and the columns holding a cell of a snap.", "cells"),
    ],
  };
  return family<None>("snap", "Snap!", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const snaps: [number, number][] = [];
    for (let i = 0; i < n * n; i++) {
      if (i % n < n - 1 && cells.v[i] === cells.v[i + 1]) snaps.push([i, i + 1]);
      if (i + n < n * n && cells.v[i] === cells.v[i + n]) snaps.push([i, i + n]);
    }
    term(ctx, "snaps", "touching pairs of equal numbers", snaps.length, cells.refs);
    const hit = [...new Set(snaps.flat())];
    for (const i of hit) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    term(ctx, "snap-values", "the snapped numbers, added up once per snap", snaps.reduce((t, [a]) => t + cells.v[a]!, 0), cells.refs);
    term(ctx, "snap-kinds", "different numbers that snap", new Set(snaps.map(([a]) => cells.v[a])).size, cells.refs);
    term(ctx, "snap-reach", "rows and columns holding a snapped cell", new Set(hit.map(i => Math.floor(i / n))).size + new Set(hit.map(i => i % n)).size, cells.refs);
  }, n);
}
