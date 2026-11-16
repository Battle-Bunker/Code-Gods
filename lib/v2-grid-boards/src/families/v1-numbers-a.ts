/**
 * Four of the old game's number families on the coloured boards (archive lib/game-utilities/src/families/grid:
 * strategy.ts for Mirrormancer, beginner/ for the rest), ported as the old game had them: the same score, the old
 * secondary points as the one tie-breaker, the same dealt parameters. They read numbers only (a card's value on cards)
 * and ignore colour. Their ids carry "original-" because the digit grid already uses the plain ids.
 *
 * The beginner families (Magic Eighteen, Opposite Nines, Two Pair) required numbers (not cards), an even side and at
 * most 6×6 in the old game; elsewhere they deal nothing. Their constants come from the board as v1 took them from
 * GridSpec (vmin 0, vmax the biggest digit), and are parameters so an agent can read them.
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { boardParams, isCard, symbolCount, type BoardState } from "../board.ts";
import { family, less, markFor, more, readBoard, sizeOf, term, type Cells, type Ctx, type Shape } from "./kit.ts";

type None = Record<string, never>;
const focus = (ctx: Ctx, cells: Cells, which: Iterable<number>) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); };
/** The biggest digit of a numbers board (9 on base 10, B on base 12, F on hex). */
const biggestDigit = (v: Variant) => symbolCount(boardParams(v).symbols) - 1;
/** The old beginner pool's requirement: numbers, not cards; an even side; at most 6×6. */
const beginnerBoard = (v: Variant) => { const { size, symbols } = boardParams(v); return !isCard(symbols) && size % 2 === 0 && size <= 6; };
/** The cells of row (or column) k, in reading order. */
const run = (n: number, axis: "rows" | "columns", k: number) => Array.from({ length: n }, (_, j) => (axis === "rows" ? k * n + j : j * n + k));
const one = (axis: "rows" | "columns") => (axis === "rows" ? "row" : "column");

// ---------------------------------------------------------------- Mirrormancer (strategy.ts)

/** v1's axis LR (rows, left to right) or TB (columns, top to bottom). */
export interface NumberMirrorParams { readonly axis: "rows" | "columns" }
export function originalMirrormancer(): RuleFamily<BoardState, NumberMirrorParams> {
  const shape: Shape<NumberMirrorParams> = {
    main: more<NumberMirrorParams>("mirrors", "rows or columns whose numbers mirror",
      p => `Make mirror ${p.axis}: each ${one(p.axis)} whose numbers read the same forwards and backwards counts.`),
    tieBreakers: [more<NumberMirrorParams>("matching-pairs", "matching number pairs",
      p => `As many matching pairs (first and last, second and second-last, and so on) in any of the ${p.axis} as possible.`)],
  };
  return family<NumberMirrorParams>("original-mirrormancer", "Mirrormancer", shape, () => [{ axis: "rows" }, { axis: "columns" }], (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let mirrors = 0, pairs = 0;
    const lit: number[] = [], paired: number[] = [];
    for (let k = 0; k < n; k++) {
      const cs = run(n, p.axis, k);
      let matches = 0;
      for (let j = 0; j < n >> 1; j++) if (cells.v[cs[j]!] === cells.v[cs[n - 1 - j]!]) { matches++; paired.push(cs[j]!, cs[n - 1 - j]!); }
      pairs += matches;
      if (matches === n >> 1) { mirrors++; lit.push(...cs); }
    }
    term(ctx, "mirrors", `mirror ${p.axis} of numbers`, mirrors, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "matching-pairs", "matching number pairs", pairs, [...new Set(paired)].map(i => cells.refs[i]!));
    markFor(ctx, "matching-pairs", cells, paired);
  });
}

// ---------------------------------------------------------------- Magic Eighteen (beginner/magic_eighteen.ts)

/** `target` is the middle total a row or column can make, N·(vmin + vmax)/2: 18 on 4×4 digits. */
export interface EighteenParams { readonly axis: "rows" | "columns"; readonly target: number }
export function originalMagicEighteen(): RuleFamily<BoardState, EighteenParams> {
  const shape: Shape<EighteenParams> = {
    main: more<EighteenParams>("on-total", "rows or columns that add up to the magic number",
      p => `Make every ${one(p.axis)} add up to ${p.target}: each ${one(p.axis)} that adds up to exactly ${p.target} counts.`),
    tieBreakers: [less<EighteenParams>("total-gap", "how far the totals are from the magic number",
      p => `Each ${one(p.axis)}'s total as close to ${p.target} as possible: the distances from ${p.target}, added up, as small as possible.`)],
  };
  const params = (v: Variant): EighteenParams[] => {
    if (!beginnerBoard(v)) return [];
    const target = (boardParams(v).size * (0 + biggestDigit(v))) / 2;
    return [{ axis: "rows", target }, { axis: "columns", target }];
  };
  return family<EighteenParams>("original-magic-eighteen", "Magic Eighteen", shape, params, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let exact = 0, distance = 0;
    const lit: number[] = [], off: number[] = [];
    for (let k = 0; k < n; k++) {
      const cs = run(n, p.axis, k);
      const total = cs.reduce((s, i) => s + cells.v[i]!, 0);
      if (total === p.target) { exact++; lit.push(...cs); } else off.push(...cs);
      distance += Math.abs(total - p.target);
    }
    term(ctx, "on-total", `${p.axis} that add up to ${p.target}`, exact, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "total-gap", `how far each ${one(p.axis)}'s total is from ${p.target}, added up`, distance, cells.refs);
    markFor(ctx, "total-gap", cells, off);   // the lines off the total
  });
}

// ---------------------------------------------------------------- Opposite Nines (beginner/opposite_nines.ts)

/** `target` is the biggest digit (9 on base 10): the total an opposite pair aims at. */
export interface NinesParams { readonly target: number }
export function originalOppositeNines(): RuleFamily<BoardState, NinesParams> {
  const shape: Shape<NinesParams> = {
    main: more<NinesParams>("opposite-totals", "opposite pairs that make the biggest digit",
      p => `Make opposite cells add up to ${p.target}: each opposite pair that adds up to ${p.target} counts. A cell's opposite is where it lands when the board turns half way round, like the top-left and bottom-right corners.`),
    tieBreakers: [less<NinesParams>("opposite-gap", "how far the opposite pairs are from the biggest digit",
      p => `Each opposite pair's total as close to ${p.target} as possible: the distances from ${p.target}, added up, as small as possible.`)],
  };
  return family<NinesParams>("original-opposite-nines", "Opposite Nines", shape, v => (beginnerBoard(v) ? [{ target: biggestDigit(v) }] : []), (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let nines = 0, distance = 0;
    const lit: number[] = [], off: number[] = [];
    for (let i = 0; i < (n * n) >> 1; i++) {
      const o = n * n - 1 - i, total = cells.v[i]! + cells.v[o]!;
      if (total === p.target) { nines++; lit.push(i, o); } else off.push(i, o);
      distance += Math.abs(total - p.target);
    }
    term(ctx, "opposite-totals", `opposite pairs that add up to ${p.target}`, nines, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "opposite-gap", `how far each opposite pair's total is from ${p.target}, added up`, distance, cells.refs);
    markFor(ctx, "opposite-gap", cells, off);   // the pairs off the total
  });
}

// ---------------------------------------------------------------- Two Pair (beginner/two_pair.ts)

export function originalTwoPair(): RuleFamily<BoardState, None> {
  const shape: Shape<None> = {
    main: more<None>("two-pairs", "boxes with two different pairs",
      "The board is cut into 2×2 boxes that tile it. Fill each box with two different pairs, like 3, 3, 8 and 8 in any order: each such box counts."),
    tieBreakers: [more<None>("one-pairs", "boxes with one pair or three of a kind",
      "As many boxes as possible with only one pair, or three of a kind (four of a kind counts for nothing).")],
  };
  return family<None>("original-two-pair", "Two Pair", shape, v => (beginnerBoard(v) ? [{}] : []), ctx => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let twoPairs = 0, onePair = 0;
    const lit: number[] = [], half: number[] = [];
    for (let r = 0; r + 1 < n; r += 2) for (let c = 0; c + 1 < n; c += 2) {
      const box = [r * n + c, r * n + c + 1, (r + 1) * n + c, (r + 1) * n + c + 1];
      const counts = new Map<number, number>();
      for (const i of box) counts.set(cells.v[i]!, (counts.get(cells.v[i]!) ?? 0) + 1);
      const sizes = [...counts.values()].sort().join(" ");
      if (sizes === "2 2") { twoPairs++; lit.push(...box); }
      else if (sizes === "1 1 2" || sizes === "1 3") { onePair++; half.push(...box); }
    }
    term(ctx, "two-pairs", "2×2 boxes with two different pairs", twoPairs, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "one-pairs", "2×2 boxes with one pair or three of a kind", onePair, half.map(i => cells.refs[i]!));
    markFor(ctx, "one-pairs", cells, half);
  });
}

/** The four, in the old game's order. */
export const V1_NUMBERS_A = [originalMirrormancer, originalMagicEighteen, originalOppositeNines, originalTwoPair] as const;
