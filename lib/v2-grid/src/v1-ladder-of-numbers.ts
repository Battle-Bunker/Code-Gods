/**
 * Ladder of Numbers, ported from v1 (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts,
 * `ladder_of_numbers`; v1 marked it weak and excluded it from every setup): read each row as one number, and climb down
 * (or up) the page with rows that each beat the row before. v1's score was a pair, (the longest unbroken climb, rows
 * that beat the row before); here the first is the main part and the second the one tie-breaker.
 *
 * UNDEALT (16 Nov, grids session): it fails the design check (design-principles.md rows 1 and 2). On the 4×4 board
 * the main part has four levels (0–3) and its top is one sort of the rows away (rows that each beat the row before
 * are any increasing order of four numbers), so the rule is solved at once and its whole score is a few bits (the top,
 * (3, 3), is 4.6 bits on grid-4-d10: sampled value function, 16 Nov); the tie-breaker (0–3 rises) is bounded the same way. Registered, in no preset.
 */
import { type RuleFamily } from "@workspace/v2-core";
import { type GridState } from "./grid.ts";
import { rows } from "./units.ts";
import { family, more, readCells, term, type Shape } from "./family-kit.ts";

export type LadderDirection = "down" | "up";
export type Ladder = { direction: LadderDirection };

export function ladderOfNumbers(n: number): RuleFamily<GridState, Ladder> {
  const shape: Shape<Ladder> = {
    main: { id: "ladder", title: "rows on the longest climb", rep: "cells", sense: "max",
      sentence: p => `Read each row as one ${n}-digit number. Going ${p.direction} the page, make the longest unbroken climb of rows that each beat the row before: count the rows on it (the row it starts from doesn't count).` },
    tieBreakers: [
      more<Ladder>("rises", "rows that beat the row before", p => `As many rows as possible should beat the row before them, going ${p.direction} the page.`, "cells"),
    ],
  };
  return family<Ladder>("ladder-of-numbers", "Ladder of Numbers", ["cells"], shape, [{ direction: "down" }, { direction: "up" }], (ctx, p) => {
    const cells = readCells(ctx, n);
    const numbers = rows(n).map(r => r.reduce((t, i) => t * 10 + cells.v[i]!, 0));
    if (p.direction === "up") numbers.reverse();
    let best = 0, climb = 0, rises = 0;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i]! > numbers[i - 1]!) { climb++; rises++; } else climb = 0;
      best = Math.max(best, climb);
    }
    term(ctx, "ladder", `rows on the longest climb ${p.direction} the page`, best, cells.refs);
    term(ctx, "rises", `rows that beat the row before, ${p.direction} the page`, rises, cells.refs);
  }, n);
}
