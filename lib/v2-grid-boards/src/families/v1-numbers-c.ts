/**
 * Four of the old game's number families on the coloured boards (archive lib/game-utilities/src/families/grid:
 * arithmetic.ts and layered/royal_court.ts), ported as the old game had them: the same score, the same dealt
 * parameters, the old secondary points (where there were any) as the one tie-breaker. They read numbers only (a card's
 * value, ace 1 … king 13), never colours. The ids carry "original-" because the digit grid already has the plain ones.
 *
 * - Magic Accountant: rows (or columns) adding up to the magic number; secondary, every row's distance from it.
 * - Number Bonds: touching pairs adding up to one more than the biggest number a cell can hold.
 * - Stepping Stones: the biggest group joined by hops between touching numbers 2 apart.
 * - Kings and Subjects: 2×2 boxes tiling the board whose single biggest number equals the other three added up;
 *   secondary, every box's gap (a box without a single biggest number deducts NO_KING, twice the number of symbols).
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { boardParams, isCard, symbolCount, symbolValue, type BoardState } from "../board.ts";
import { family, less, more, readBoard, sizeOf, term, type Cells, type Ctx, type Shape } from "./kit.ts";

const focus = (ctx: Ctx, cells: Cells, which: Iterable<number>) => { for (const i of new Set(which)) ctx.mark({ kind: "focus", ref: cells.refs[i]! }); };
/** The values a symbol of the board can have (digits 0 … base−1; cards 1 … 13). */
const values = (v: Variant): number[] => Array.from({ length: symbolCount(boardParams(v).symbols) }, (_, s) => symbolValue(v, s));
const vmin = (v: Variant) => Math.min(...values(v));
const vmax = (v: Variant) => Math.max(...values(v));

// ---------------------------------------------------------------- Magic Accountant

export interface MagicParams { readonly axis: "rows" | "columns"; readonly target: number }
/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
}
/** The old magicTargets: the middle total and the 3 either side of it, kept within what a row can total. */
export function magicTargets(v: Variant): number[] {
  const n = boardParams(v).size, lo = vmin(v), hi = vmax(v), mid = roundHalfEven((n * (lo + hi)) / 2), out = new Set<number>();
  for (let k = -3; k <= 3; k++) out.add(Math.min(Math.max(mid + k, n * lo), n * hi));
  return [...out].sort((a, b) => a - b);
}
const unit = (p: MagicParams) => (p.axis === "rows" ? "row" : "column");

export function originalMagicAccountant(): RuleFamily<BoardState, MagicParams> {
  const shape: Shape<MagicParams> = {
    main: more<MagicParams>("magic-totals", "rows or columns that add up to your magic number",
      p => `Make every ${unit(p)} add up to your magic number, ${p.target}. Each ${unit(p)} whose numbers add up to exactly ${p.target} counts.`),
    tieBreakers: [
      less<MagicParams>("magic-distance", "how far the totals are from your magic number",
        p => `Every ${unit(p)} as close to ${p.target} as possible: how far each ${unit(p)}'s total is from ${p.target}, added up over the ${p.axis}, as small as possible.`),
    ],
  };
  const params = (v: Variant): MagicParams[] => (["rows", "columns"] as const).flatMap(axis => magicTargets(v).map(target => ({ axis, target })));
  return family<MagicParams>("original-magic-accountant", "Magic Accountant", shape, params, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let exact = 0, distance = 0;
    const lit: number[] = [];
    for (let k = 0; k < n; k++) {
      const run = Array.from({ length: n }, (_, j) => (p.axis === "rows" ? k * n + j : j * n + k));
      const total = run.reduce((s, i) => s + cells.v[i]!, 0);
      if (total === p.target) { exact++; lit.push(...run); }
      distance += Math.abs(total - p.target);
    }
    term(ctx, "magic-totals", `${p.axis} that add up to ${p.target}`, exact, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "magic-distance", `how far the ${p.axis}' totals are from ${p.target}, added up`, distance, cells.refs);
  });
}

// ---------------------------------------------------------------- Number Bonds

/** The old card's TARGET: one more than the biggest a cell can hold (10 on digits, 16 on hex, 14 on cards). */
export interface NumberBondParams { readonly target: number }
export function originalNumberBonds(): RuleFamily<BoardState, NumberBondParams> {
  const shape: Shape<NumberBondParams> = {
    main: more<NumberBondParams>("number-bonds", "touching pairs that make the magic number",
      p => `Make touching cells (side by side or one above the other) whose numbers add up to ${p.target}. Each such pair scores 1.`),
    tieBreakers: [],
  };
  return family<NumberBondParams>("original-number-bonds", "Number Bonds", shape, v => [{ target: vmax(v) + 1 }], (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let bonds = 0;
    const lit: number[] = [];
    for (let i = 0; i < n * n; i++) for (const o of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (o >= 0 && cells.v[i]! + cells.v[o]! === p.target) { bonds++; lit.push(i, o); }
    }
    term(ctx, "number-bonds", `touching pairs that add up to ${p.target}`, bonds, cells.refs);
    focus(ctx, cells, lit);
  });
}

// ---------------------------------------------------------------- Stepping Stones

/** The old HOP (2): touching cells whose numbers differ by exactly this much are joined. */
export interface SteppingParams { readonly hop: number }
export function originalSteppingStones(): RuleFamily<BoardState, SteppingParams> {
  const shape: Shape<SteppingParams> = {
    main: more<SteppingParams>("stepping-group", "cells in your biggest group of stepping stones",
      p => `Grow the biggest group of cells you can hop between: you can hop between touching cells (side by side or one above the other) whose numbers differ by exactly ${p.hop}, and a group is every cell you can reach by hopping from one cell. Each cell in your biggest group scores 1.`),
    tieBreakers: [],
  };
  return family<SteppingParams>("original-stepping-stones", "Stepping Stones", shape, () => [{ hop: 2 }], (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    const seen = new Set<number>();
    let best: number[] = [];
    for (let s = 0; s < n * n; s++) {
      if (seen.has(s)) continue;
      const g = [s];
      seen.add(s);
      for (let k = 0; k < g.length; k++) {
        const i = g[k]!, r = Math.floor(i / n), c = i % n;
        for (const o of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
          if (o >= 0 && !seen.has(o) && Math.abs(cells.v[i]! - cells.v[o]!) === p.hop) { seen.add(o); g.push(o); }
        }
      }
      if (g.length > best.length) best = g;
    }
    term(ctx, "stepping-group", `cells in your biggest group of hops of ${p.hop}`, best.length, cells.refs);
    focus(ctx, cells, best);
  });
}

// ---------------------------------------------------------------- Kings and Subjects

/**
 * `squares`: "corners" are the 2×2 boxes that tile the board (the old dealt base); "all" is the old expert variant on
 * every overlapping 2×2 square (in the domain, never dealt). `noKing`: what a box without a single biggest number
 * deducts, the old NO_KING (twice the number of symbols: 20 on digits).
 */
export interface KingsParams { readonly squares: "corners" | "all"; readonly noKing: number }
/** The top-left cells of the squares that score. */
const courtCorners = (n: number, squares: KingsParams["squares"]): number[] => {
  const step = squares === "corners" ? 2 : 1, out: number[] = [];
  for (let r = 0; r + 1 < n; r += step) for (let c = 0; c + 1 < n; c += step) out.push(r * n + c);
  return out;
};
export function originalKingsAndSubjects(): RuleFamily<BoardState, KingsParams> {
  const box = (p: KingsParams) => (p.squares === "corners" ? "box" : "square");
  const shape: Shape<KingsParams> = {
    main: more<KingsParams>("courts", "boxes whose king equals his subjects added up",
      p => p.squares === "corners"
        ? "Make each 2×2 box that tiles the board a court: a box is a court when its biggest number, the king, equals the other three, the subjects, added up (like 9 with 2, 3 and 4). Each court counts."
        : "Make as many 2×2 squares as you can (they overlap) into courts: a square is a court when its biggest number, the king, equals the other three, the subjects, added up (like 9 with 2, 3 and 4). Each court counts."),
    tieBreakers: [
      less<KingsParams>("court-gaps", "how far the kings are from their subjects added up",
        p => `Kings as close to their subjects as possible: each ${box(p)} adds how far its king is from the sum of its subjects, and a ${box(p)} whose biggest number appears more than once has no king and adds ${p.noKing}; the total as small as possible.`),
    ],
  };
  // The old requirements: digit boards only, boxes that tile the board (an even side), at most 4×4.
  const params = (v: Variant): KingsParams[] => {
    const { size, symbols } = boardParams(v);
    return isCard(symbols) || size % 2 === 1 || size > 4 ? [] : [{ squares: "corners", noKing: 2 * symbolCount(symbols) }];
  };
  return family<KingsParams>("original-kings-and-subjects", "Kings and Subjects", shape, params, (ctx, p) => {
    const n = sizeOf(ctx);
    const cells = readBoard(ctx, n);
    let courts = 0, gap = 0;
    const lit: number[] = [];
    for (const i of courtCorners(n, p.squares)) {
      const four = [i, i + 1, i + n, i + n + 1], vals = four.map(j => cells.v[j]!);
      const top = Math.max(...vals), total = vals.reduce((a, b) => a + b, 0);
      if (vals.filter(x => x === top).length > 1) { gap += p.noKing; continue; }
      const away = Math.abs(2 * top - total);
      gap += away;
      if (away === 0) { courts++; lit.push(...four); }
    }
    term(ctx, "courts", `2×2 ${p.squares === "corners" ? "boxes" : "squares"} that are courts`, courts, cells.refs);
    focus(ctx, cells, lit);
    term(ctx, "court-gaps", "how far the kings are from their subjects, added up", gap, cells.refs);
  });
}
