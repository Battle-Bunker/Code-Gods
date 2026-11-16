/**
 * Four of the old game's beginner number rules (archive lib/game-utilities/src/families/grid/beginner: spread_three.ts,
 * strangers.ts, leapfrog.ts, crosswise_threes.ts), ported onto the coloured boards as the old game had them: the same
 * score, the old secondary points (where there were any) as the one tie-breaker, the same dealt parameters (none: each
 * old family dealt one rule per board it allowed). They read numbers only and ignore colour. Their ids carry the
 * prefix "original-" because the digit grid has rules of similar names.
 *
 * Where the old family could be dealt (its `requires`): numbered boards (digits, not cards) of side 4 to 6, and
 * Strangers on even sides only (its 2×2 boxes must tile the board).
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { boardParams, isCard, type BoardState } from "../board.ts";
import { family, less, markFor, more, readBoard, sizeOf, term, type Cells, type Ctx, type Shape } from "./kit.ts";

type None = Record<string, never>;
const focus = (ctx: Ctx, cells: Cells, which: Iterable<number>) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); };
/** The old `requires`: numbers (not cards), side 4 to 6, and (Strangers) an even side. */
const dealtOn = (even: boolean) => (v: Variant): None[] => {
  const { size, symbols } = boardParams(v);
  return !isCard(symbols) && size >= 4 && size <= 6 && (!even || size % 2 === 0) ? [{}] : [];
};

// ---------------------------------------------------------------- Spread of Three (spread_three.ts)

/** The spread every 2×2 square aims at: its biggest number minus its smallest. */
export const SPREAD = 3;

/** Each 2×2 square (they overlap) whose spread is exactly 3 counts; the old secondary deducts each step a spread is away from 3. */
export function originalSpreadThree(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("spot-on-squares", "2×2 squares that spread exactly 3",
      `Give every 2×2 square a spread of exactly ${SPREAD}: its biggest number minus its smallest, so 7, 4, 5 and 6 spread 7 − 4 = ${SPREAD}. The squares overlap, so a cell can be in up to 4 of them. Each square that spreads exactly ${SPREAD} scores 1.`),
    tieBreakers: [
      less<None>("spread-gaps", "steps the squares' spreads are away from 3",
        `As few steps as possible between each 2×2 square's spread and ${SPREAD}, added up over every square.`),
    ],
  };
  return family<None>("original-spread-three", "Spread of Three", shape, dealtOn(false), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let spotOn = 0, gaps = 0;
    const lit: number[] = [], off: number[] = [];
    for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) {
      const square = [r * n + c, r * n + c + 1, (r + 1) * n + c, (r + 1) * n + c + 1];
      const vs = square.map(i => cells.v[i]!);
      const spread = Math.max(...vs) - Math.min(...vs);
      if (spread === SPREAD) { spotOn++; lit.push(...square); } else off.push(...square);
      gaps += Math.abs(spread - SPREAD);
    }
    term(ctx, "spot-on-squares", `2×2 squares that spread exactly ${SPREAD}`, spotOn, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "spread-gaps", `steps the squares' spreads are away from ${SPREAD}`, gaps, cells.refs);
    markFor(ctx, "spread-gaps", cells, off);   // the squares off the spread
  });
}

// ---------------------------------------------------------------- Strangers (strangers.ts)

/** The biggest number that divides both (0 when both are 0). */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Touching numbers inside each 2×2 box that tiles the board should be strangers: no divisor bigger than 1 in common,
 * and not next to each other when counting. The units are the 4 touching pairs of each box (pairs across two boxes do
 * not count). Main part: pairs of strangers both bigger than 1. The old secondary: a 1 beside a number bigger than 1.
 */
export function originalStrangers(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("stranger-pairs", "touching strangers in a box, both bigger than 1",
      "Cut the board into 2×2 boxes and make touching numbers in the same box strangers: no number bigger than 1 divides both, and they are not next to each other when counting. So 4 and 9 are strangers; 4 and 6 share 2; 4 and 5 are next-door. Each pair of strangers in a box (side by side or one above the other) scores 1 when both are bigger than 1."),
    tieBreakers: [
      more<None>("ones-beside-bigger", "1s touching a bigger number in their box",
        "As many places as possible where a 1 touches a number bigger than 1 in the same box (side by side or one above the other)."),
    ],
  };
  return family<None>("original-strangers", "Strangers", shape, dealtOn(true), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let pairs = 0, ones = 0;
    const lit: number[] = [], beside: number[] = [];
    // The touching pairs inside the boxes: in each row and each column, cells 1 and 2, 3 and 4, and so on.
    for (let k = 0; k < n; k++) for (let j = 0; j + 1 < n; j += 2) {
      for (const [i, o] of [[k * n + j, k * n + j + 1], [j * n + k, (j + 1) * n + k]] as const) {
        const a = cells.v[i]!, b = cells.v[o]!;
        if (a * b < 2 || gcd(a, b) > 1) continue;   // a 0, two 1s, or a shared divisor
        if (a === 1 || b === 1) { ones++; beside.push(i, o); }
        else if (Math.abs(a - b) > 1) { pairs++; lit.push(i, o); }
      }
    }
    term(ctx, "stranger-pairs", "touching strangers in a box, both bigger than 1", pairs, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "ones-beside-bigger", "1s touching a bigger number in their box", ones, cells.refs);
    markFor(ctx, "ones-beside-bigger", cells, beside);
  });
}

// ---------------------------------------------------------------- Leapfrog (leapfrog.ts)

/** In every row, each number and the number two cells along (leaping over the cell between) should be one apart. */
export function originalLeapfrog(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("leaps", "numbers one away from the number two cells along their row",
      "Make every number one away from the number two cells along its row, like 4 _ 5: leap over the cell between. Each such pair scores 1."),
    tieBreakers: [],
  };
  return family<None>("original-leapfrog", "Leapfrog", shape, dealtOn(false), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let leaps = 0;
    const lit: number[] = [];
    for (let r = 0; r < n; r++) for (let k = 0; k + 2 < n; k++) {
      const i = r * n + k, o = i + 2;
      if (Math.abs(cells.v[i]! - cells.v[o]!) === 1) { leaps++; lit.push(i, o); }
    }
    term(ctx, "leaps", "pairs two cells apart in a row that are one apart", leaps, cells.refs);
    focus(ctx, cells, lit);
  });
}

// ---------------------------------------------------------------- Crosswise Threes (crosswise_threes.ts)

/** The difference every folded pair aims at. */
export const APART = 3;

/**
 * Fold the board along the diagonal from the top-right corner to the bottom-left: (r, c) lands on (N−1−c, N−1−r). Each
 * pair 3 apart counts; the old secondary deducts how far each pair's difference is from 3. Cells on the fold line
 * have no partner and never count.
 */
export function originalCrosswiseThrees(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("pairs-three-apart", "folded pairs 3 apart",
      `Fold the board corner to corner, from the top-right corner to the bottom-left, so the top row lands on the right column: each number should land on a number ${APART} apart from it, like 2 and 5. Cells on the fold line have no partner and never count. Each pair ${APART} apart scores 1.`),
    tieBreakers: [
      less<None>("fold-gaps", "steps the folded pairs' differences are away from 3",
        `As few steps as possible between each folded pair's difference and ${APART}, added up over every pair: 4 and 4 are 3 steps away, 2 and 9 are 4.`),
    ],
  };
  return family<None>("original-crosswise-threes", "Crosswise Threes", shape, dealtOn(false), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let threes = 0, gaps = 0;
    const lit: number[] = [], off: number[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; r + c < n - 1; c++) {
      const i = r * n + c, o = (n - 1 - c) * n + (n - 1 - r);
      const away = Math.abs(Math.abs(cells.v[i]! - cells.v[o]!) - APART);
      if (away === 0) { threes++; lit.push(i, o); } else off.push(i, o);
      gaps += away;
    }
    term(ctx, "pairs-three-apart", `folded pairs ${APART} apart`, threes, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "fold-gaps", `steps the folded pairs' differences are away from ${APART}`, gaps, cells.refs);
    markFor(ctx, "fold-gaps", cells, off);   // the pairs not 3 apart
  });
}
