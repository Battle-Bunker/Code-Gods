/**
 * Sudoku Scholar, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/games.ts, `sudoku_scholar`;
 * v1 marked it weak and excluded it from every one-colour board): no number twice in a row, a column or a long diagonal.
 * v1's 4×4 score was all or nothing (1 if no row, column or long diagonal repeats a number); v2 has no yes/no main part
 * (owner decision 13), so the main part is v1's larger-board primary on the 4×4 board's lines (rows, columns and both
 * long diagonals): the ones where no number appears twice. The one tie-breaker is v1's larger-board secondary: in every
 * row and column, the different numbers, added up (a repeat counts once).
 *
 * UNDEALT (16 Nov, grids session): it fails the design check (design-principles.md rows 1, 3a and 4) beyond the grid
 * baseline. Its top is known and printed on v1's own card as the example: a 4×4 board holding four numbers once in every
 * row, column and long diagonal scores the main part's maximum (10) and the tie-breaker's (32), 15.3 bits on grid-4-d10
 * (sampled value function, 16 Nov), and every relabelling of the four numbers is another copy of it: an optimum found by
 * being told the rule (CLAUDE.md: a bug). v1 also removed its one parameter, so it has one instance and one secondary.
 * Registered, in no preset.
 */
import { type RuleFamily } from "@workspace/v2-core";
import { type GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { diagonals, family, more, readCells, term, type Shape } from "./family-kit.ts";

type None = Record<string, never>;

export function sudokuScholar(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("sudoku", "rows, columns and long diagonals with no number twice",
      "No number should appear twice in a row, a column or a long diagonal. Count the rows, columns and long diagonals where no number appears twice.", "cells"),
    tieBreakers: [
      more<None>("variety", "different numbers in each row and column, added up",
        "In every row and column, count the different numbers (a repeat counts once), and add them up: as many as possible.", "cells"),
    ],
  };
  return family<None>("sudoku-scholar", "Sudoku Scholar", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    const different = (l: readonly number[]) => new Set(l.map(i => cells.v[i])).size;
    const clean = [...rows(n), ...cols(n), ...diagonals(n)].filter(l => different(l) === l.length);
    term(ctx, "sudoku", "rows, columns and long diagonals with no number twice", clean.length, cells.refs);
    for (const i of new Set(clean.flat())) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
    term(ctx, "variety", "different numbers in each row and column, added up", [...rows(n), ...cols(n)].reduce((t, l) => t + different(l), 0), cells.refs);
  }, n);
}
