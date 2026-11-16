/**
 * Twenty-One, ported from v1's twenty_one (archive/engine-v1 lib/game-utilities/src/families/grid/games.ts): every row
 * and every column is a blackjack hand. A hand of T or less scores its total, a hand of exactly T scores T more, and a
 * hand over T (bust) scores nothing. v1's targets on a 4×4 board of digits 0–9 are the middle six of its sixteen spread
 * targets, 15 to 20, the ones v1 measured as peers (equal opportunity). v1 scored the points alone; v2 keeps them as
 * the main part and adds three tie-breakers on the hands it scores (the engine deals a rule with one): how far the bust
 * hands went over, the crossings of two hands of exactly T, and how small the biggest number of each such hand is.
 * Undealt (presets.ts): a cheap peak, 35.8 bits for 230⚡ on the energy gate (16 Nov).
 */
import { ref, type RuleFamily } from "@workspace/v2-core";
import type { GridState } from "./grid.ts";
import { cols, rows } from "./units.ts";
import { distance, family, more, readCells, readNum, term, type Shape } from "./family-kit.ts";

type Target = { T: number };
/** v1's targets for a 4×4 board of digits 0–9 (spread(g).slice(6, 12)). */
export const TWENTY_ONE_TARGETS = [15, 16, 17, 18, 19, 20] as const;

export function twentyOne(n: number): RuleFamily<GridState, Target> {
  const shape: Shape<Target> = {
    main: more<Target>("hands", "points from the rows and columns as blackjack hands",
      p => `Get close to ${p.T} without going bust. Each row and each column is a blackjack hand: add it up. A hand of ${p.T} or less scores its total in points, and exactly ${p.T} scores ${p.T} more. A hand over ${p.T} is bust and scores nothing. More points is better.`, "tally"),
    tieBreakers: [
      distance<Target>("bust-by-little", "how far the bust hands are over the target, added up",
        p => `The bust hands should be as little over ${p.T} as possible: add up how far each one is over.`, "tally"),
      more<Target>("crossing-blackjacks", "a row and a column of exactly the target that cross",
        p => `Count each row of exactly ${p.T} with each column of exactly ${p.T} (they cross at one cell): as many as possible.`, "tally"),
      distance<Target>("low-cards", "the biggest number in each hand of exactly the target, added up",
        p => `The hands of exactly ${p.T} should be made of small numbers: add up the biggest number in each, as little as possible.`, "cells"),
    ],
  };
  return family<Target>("twenty-one", "Twenty-One", ["tally", "cells"], shape, TWENTY_ONE_TARGETS.map(T => ({ T })), (ctx, p) => {
    const rowRefs = rows(n).map((_, k) => ref("tally", `row${k}`)), colRefs = cols(n).map((_, k) => ref("tally", `col${k}`));
    const refs = [...rowRefs, ...colRefs], totals = refs.map(r => readNum(ctx, r));
    const points = totals.reduce((t, x) => t + (x > p.T ? 0 : x === p.T ? 2 * x : x), 0);
    term(ctx, "hands", `points from the rows and columns as hands aiming at ${p.T}`, points, refs);
    refs.forEach((r, k) => { const x = totals[k]!; ctx.mark(x === p.T ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: x > p.T ? `bust by ${x - p.T}` : `${p.T - x} short` }); });
    term(ctx, "bust-by-little", `how far the bust hands are over ${p.T}, added up`, totals.reduce((t, x) => t + Math.max(0, x - p.T), 0), refs);
    const exactRows = totals.slice(0, n).filter(x => x === p.T).length, exactCols = totals.slice(n).filter(x => x === p.T).length;
    term(ctx, "crossing-blackjacks", `rows of exactly ${p.T} times columns of exactly ${p.T}`, exactRows * exactCols, refs);
    const cells = readCells(ctx, n);
    const hands = [...rows(n), ...cols(n)].filter((_, k) => totals[k] === p.T);
    term(ctx, "low-cards", `the biggest number in each hand of exactly ${p.T}, added up`, hands.reduce((t, h) => t + Math.max(...h.map(i => cells.v[i]!)), 0), cells.refs);
  }, n);
}
