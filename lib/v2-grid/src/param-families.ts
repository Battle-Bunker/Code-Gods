/**
 * Parameterised grid families (owner decisions 40–42; trials declared by the coordinator, undealt until gated): one shared
 * relation per card with one or two dealt numbers, plus the units it reads, and the guard every main part carries: no
 * two rows or two columns the same (the period-2 route). A family deals the (value, tie-breaker) pairs in PARAM_DEALT,
 * each of the same reach in play (a 100-move climber from π boards reaches a median of 17 ± 0.5 bits, main part and
 * tie-breaker as dealt), and a redraw (parameter drift) moves to a nearby value (`gridDriftNeighbours`).
 *
 * - Magic Totals: the residue family (Magic Accountant and Magic Eighteen folded in), totals leaving r when divided by q.
 * - Spread: windows (2×2 squares, three-in-a-rows, whole rows or columns) with a spread of exactly s.
 * - Number Lines: each row (or column) read as one number, as close as possible to a number leaving r when divided by q.
 * - Pair Sums: Opposite Nines' card shape over eight pairings (the 37-bit "add up to 9" is not dealt).
 *
 * None declares exact units (sums.ts): the units a value reads depend on its params, and a units plan does not see them.
 */
import { q as Q, type ElementRef, type RuleFamily, type Variant } from "@workspace/v2-core";
import { at, gridParams, type GridState } from "./grid.ts";
import { distance, family, more, readCells, type Ctx, type Shape } from "./family-kit.ts";
import { boxes, cols, gcd, pairs, rows } from "./units.ts";

const circ = (x: number, q: number) => { const m = ((x % q) + q) % q; return Math.min(m, q - m); };
const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);
type Cells = { v: number[]; refs: ElementRef[] };
const focusUnits = (ctx: Ctx, cells: Cells, units: readonly (readonly number[])[], perfect: (k: number) => boolean) => {
  const seen = new Set<number>();
  units.forEach((u, k) => { if (perfect(k)) for (const i of u) if (!seen.has(i)) { seen.add(i); ctx.mark({ kind: "focus", ref: cells.refs[i]! }); } });
};
const mostCommon = (xs: readonly number[]) => { const c = new Map<number, number>(); for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1); return Math.max(0, ...c.values()); };
const leaves = (r: number, q: number) => (r === 0 ? `be a multiple of ${q}` : `leave ${r} when divided by ${q}`);
/** The same remainder after "a number that": "is a multiple of 7" or "leaves 3 when divided by 7". */
const thatLeaves = (r: number, q: number) => (r === 0 ? `is a multiple of ${q}` : `leaves ${r} when divided by ${q}`);
/**
 * The guard every main part carries (the period-2 route, gate of #713): boards that repeat a row or a column (two
 * alternating digits, repeated row pairs) met every main part at once. Each row equal to an earlier row, and each column
 * equal to an earlier column, adds 1 to the main part's distance.
 */
export const NO_REPEATS = ", and no two rows or two columns may be the same";
export function repeats(n: number, v: readonly number[]): number {
  const seen = (ls: number[][]) => { const s = new Set<string>(); let r = 0; for (const l of ls) { const k = l.map(i => v[i]).join(","); if (s.has(k)) r++; else s.add(k); } return r; };
  return seen(rows(n)) + seen(cols(n));
}

// ---------------------------------------------------------------- 1. Magic Totals (the residue family)

export type TotalUnits = "rows-columns" | "rows-boxes" | "columns-boxes";
export type MagicTotalsParams = { units: TotalUnits; q: number; r: number };
const TOTAL_WORDS: Record<TotalUnits, string> = { "rows-columns": "Every row's and every column's total", "rows-boxes": "Every row's and every corner box's total", "columns-boxes": "Every column's and every corner box's total" };
const totalUnits = (n: number, u: TotalUnits) => u === "rows-columns" ? [...rows(n), ...cols(n)] : u === "rows-boxes" ? [...rows(n), ...boxes(n)] : [...cols(n), ...boxes(n)];

export function magicTotals(n: number): RuleFamily<GridState, MagicTotalsParams> {
  const shape: Shape<MagicTotalsParams> = {
    main: distance<MagicTotalsParams>("totals", "totals leaving the dealt remainder", p => `${TOTAL_WORDS[p.units]} should ${leaves(p.r, p.q)}${NO_REPEATS}.`, "cells"),
    tieBreakers: [
      more<MagicTotalsParams>("same-quotient", "totals giving the same whole number when divided", p => `Those totals divided by ${p.q} should give the same whole number as often as possible.`, "cells"),
      distance<MagicTotalsParams>("small-totals", "those totals added up", () => "Those totals should add up to as little as possible.", "cells"),
      more<MagicTotalsParams>("different-totals", "different totals", () => "Those totals should be as many different numbers as possible.", "cells"),
    ],
  };
  const params = (v: Variant): MagicTotalsParams[] => (gridParams(v).size === 4 ? MT_DEALT.map(([units, q, r]) => ({ units, q, r })) : [{ units: "rows-columns", q: 3, r: 1 }]);
  return family<MagicTotalsParams>("magic-totals", "Magic Totals", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), units = totalUnits(n, p.units), totals = units.map(u => sum(u.map(i => cells.v[i]!)));
    const off = totals.map(t => circ(t - p.r, p.q));
    ctx.term("totals", "how far the totals are from leaving the remainder, added up, and the repeated rows and columns", Q(sum(off) + repeats(n, cells.v)), cells.refs);
    focusUnits(ctx, cells, units, k => off[k] === 0);
    ctx.term("same-quotient", "totals sharing the commonest whole-number quotient", Q(mostCommon(totals.map(t => Math.floor(t / p.q)))), cells.refs);
    ctx.term("small-totals", "those totals added up", Q(sum(totals)), cells.refs);
    ctx.term("different-totals", "different totals", Q(new Set(totals).size), cells.refs);
  }, n);
}

// ---------------------------------------------------------------- 2. Spread

export type SpreadWindows = "squares" | "squares-rows" | "squares-columns" | "row-triples" | "column-triples" | "squares-row-triples" | "squares-column-triples";
export type SpreadParams = { windows: SpreadWindows; s: number };
const SPREAD_WORDS: Record<SpreadWindows, string> = {
  squares: "Every 2×2 square", "squares-rows": "Every 2×2 square and every row", "squares-columns": "Every 2×2 square and every column",
  "row-triples": "Every three cells side by side in a row", "column-triples": "Every three cells one above another in a column",
  "squares-row-triples": "Every 2×2 square and every three cells side by side in a row", "squares-column-triples": "Every 2×2 square and every three cells one above another in a column",
};
/** The windows, each in reading order; a square is [top-left, top-right, bottom-left, bottom-right]. */
export function spreadWindows(n: number, w: SpreadWindows): { cells: number[]; square: boolean }[] {
  const sq: { cells: number[]; square: boolean }[] = [];
  for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) sq.push({ cells: [at(n, r, c), at(n, r, c + 1), at(n, r + 1, c), at(n, r + 1, c + 1)], square: true });
  const triples = (ls: number[][]) => ls.flatMap(l => l.slice(0, -2).map((_, k) => ({ cells: l.slice(k, k + 3), square: false })));
  const whole = (ls: number[][]) => ls.map(l => ({ cells: l, square: false }));
  switch (w) {
    case "squares": return sq;
    case "squares-rows": return [...sq, ...whole(rows(n))];
    case "squares-columns": return [...sq, ...whole(cols(n))];
    case "row-triples": return triples(rows(n));
    case "column-triples": return triples(cols(n));
    case "squares-row-triples": return [...sq, ...triples(rows(n))];
    case "squares-column-triples": return [...sq, ...triples(cols(n))];
  }
}
const spreadOf = (x: readonly number[]) => Math.max(...x) - Math.min(...x);
/** The biggest and the smallest each appear once and sit as far apart as the window allows: across a square's diagonal, at the two ends of a row of cells. */
const extremesApart = (x: readonly number[], square: boolean) => {
  const hi = Math.max(...x), lo = Math.min(...x);
  if (x.filter(y => y === hi).length !== 1 || x.filter(y => y === lo).length !== 1) return false;
  const h = x.indexOf(hi), l = x.indexOf(lo);
  return square ? h + l === 3 : Math.min(h, l) === 0 && Math.max(h, l) === x.length - 1;
};

export function spreadFamily(n: number): RuleFamily<GridState, SpreadParams> {
  const shape: Shape<SpreadParams> = {
    main: distance<SpreadParams>("spread", "windows with the dealt spread",
      p => `${SPREAD_WORDS[p.windows]} should have a spread of exactly ${p.s} (its biggest number minus its smallest)${NO_REPEATS}.`, "cells"),
    tieBreakers: [
      more<SpreadParams>("extremes-apart", "windows with their biggest and smallest far apart",
        () => "In as many of them as possible the biggest and the smallest number should sit as far apart as they can: across a square's diagonal, at the ends of a row of cells.", "cells"),
      distance<SpreadParams>("low-floor", "their smallest numbers added up", () => "Their smallest numbers should add up to as little as possible.", "cells"),
      more<SpreadParams>("all-different", "windows of all different numbers", () => "As many of them as possible should hold all different numbers.", "cells"),
    ],
  };
  const params = (v: Variant): SpreadParams[] => (gridParams(v).size === 4 ? SPREAD_DEALT.map(([windows, s]) => ({ windows, s })) : [{ windows: "squares", s: 1 }]);
  return family<SpreadParams>("spread", "Spread", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), ws = spreadWindows(n, p.windows), vs = ws.map(w => w.cells.map(i => cells.v[i]!));
    const off = vs.map(x => Math.abs(spreadOf(x) - p.s));
    ctx.term("spread", "how far each window's spread is from the dealt one, added up, and the repeated rows and columns", Q(sum(off) + repeats(n, cells.v)), cells.refs);
    focusUnits(ctx, cells, ws.map(w => w.cells), k => off[k] === 0);
    ctx.term("extremes-apart", "windows with their biggest and smallest far apart", Q(vs.filter((x, k) => extremesApart(x, ws[k]!.square)).length), cells.refs);
    ctx.term("low-floor", "the windows' smallest numbers added up", Q(sum(vs.map(x => Math.min(...x)))), cells.refs);
    ctx.term("all-different", "windows of all different numbers", Q(vs.filter(x => new Set(x).size === x.length).length), cells.refs);
  }, n);
}

// ---------------------------------------------------------------- 3. Number Lines

export type NumberAxis = "rows" | "columns" | "rows-columns";
export type NumberLinesParams = { axis: NumberAxis; q: number; r: number };
const AXIS_WORDS: Record<NumberAxis, string> = {
  rows: "Read each row from left to right as one number", columns: "Read each column from top to bottom as one number",
  "rows-columns": "Read each row from left to right and each column from top to bottom as one number",
};
const axisUnits = (n: number, a: NumberAxis) => (a === "rows" ? rows(n) : a === "columns" ? cols(n) : [...rows(n), ...cols(n)]);
const numberOf = (ds: readonly number[]) => ds.reduce((t, d) => t * 10 + d, 0);
/** The nearest number leaving r when divided by q (the smaller on a tie). */
const nearestLeaving = (x: number, q: number, r: number) => { const m = (((x - r) % q) + q) % q; return m <= q - m ? x - m : x + q - m; };

export function numberLines(n: number): RuleFamily<GridState, NumberLinesParams> {
  const shape: Shape<NumberLinesParams> = {
    main: distance<NumberLinesParams>("numbers", "numbers close to the dealt remainder",
      p => `${AXIS_WORDS[p.axis]}: each should be as close as possible to a number that ${thatLeaves(p.r, p.q)}${NO_REPEATS}.`, "cells"),
    tieBreakers: [
      more<NumberLinesParams>("same-last-digit", "nearest such numbers ending in the commonest digit", () => "The nearest such numbers should end in the same digit as often as possible.", "cells"),
      more<NumberLinesParams>("big-leads", "the numbers' first digits added up", () => "Those numbers should start with digits as big as possible (their first digits added up).", "cells"),
      more<NumberLinesParams>("shared-factors", "neighbouring numbers sharing a factor", p => `Neighbouring ${p.axis === "columns" ? "columns'" : p.axis === "rows" ? "rows'" : "rows' (and columns')"} numbers should share a factor bigger than 1 as often as possible.`, "cells"),
    ],
  };
  const params = (v: Variant): NumberLinesParams[] => (gridParams(v).size === 4 ? NL_DEALT.map(([axis, q, r]) => ({ axis, q, r })) : [{ axis: "rows", q: 7, r: 1 }]);
  return family<NumberLinesParams>("number-lines", "Number Lines", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), units = axisUnits(n, p.axis), nums = units.map(u => numberOf(u.map(i => cells.v[i]!)));
    const off = nums.map(x => circ(x - p.r, p.q));
    ctx.term("numbers", "how far each number is from one leaving the remainder, added up, and the repeated rows and columns", Q(sum(off) + repeats(n, cells.v)), cells.refs);
    focusUnits(ctx, cells, units, k => off[k] === 0);
    ctx.term("same-last-digit", "nearest such numbers ending in the commonest digit", Q(mostCommon(nums.map(x => Math.abs(nearestLeaving(x, p.q, p.r)) % 10))), cells.refs);
    ctx.term("big-leads", "the numbers' first digits added up", Q(sum(units.map(u => cells.v[u[0]!]!))), cells.refs);
    // Neighbours within one direction: row k with row k + 1 (and column k with column k + 1 when both are read).
    const groups = p.axis === "rows-columns" ? [nums.slice(0, n), nums.slice(n)] : [nums];
    const shared = sum(groups.map(g => g.slice(1).filter((x, k) => gcd(x, g[k]!) > 1).length));
    ctx.term("shared-factors", "neighbouring numbers sharing a factor", Q(shared), cells.refs);
  }, n);
}

// ---------------------------------------------------------------- 4. Pair Sums

export type Pairing = "half-turn" | "row-mirror" | "column-mirror" | "side-by-side" | "stacked" | "row-leap" | "column-leap" | "box-diagonal";
/** A pair should add up to `total`, or (with `every`) to `total` plus a multiple of `every`. */
export type PairSumsParams = { pairing: Pairing; total: number; every?: number };
const PAIR_WORDS: Record<Pairing, string> = {
  "half-turn": "its opposite (where a half turn of the board takes it)", "row-mirror": "its mirror across the middle of its row",
  "column-mirror": "its mirror across the middle of its column", "side-by-side": "its partner beside it (the cells of each row paired off from the left)",
  stacked: "its partner above or below it (the cells of each column paired off from the top)", "row-leap": "the cell two along in its row",
  "column-leap": "the cell two down in its column", "box-diagonal": "the cell diagonally across its corner box",
};
export const PAIRINGS: readonly Pairing[] = ["half-turn", "row-mirror", "column-mirror", "side-by-side", "stacked", "row-leap", "column-leap", "box-diagonal"];
export function pairingCells(n: number, p: Pairing): [number, number][] {
  const out: [number, number][] = [];
  const add = (f: (r: number, c: number) => [number, number] | null) => { for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const x = f(r, c); if (x) out.push([at(n, r, c), at(n, x[0], x[1])]); } };
  switch (p) {
    case "half-turn": return pairs(n);
    case "row-mirror": add((r, c) => (c < n / 2 ? [r, n - 1 - c] : null)); break;
    case "column-mirror": add((r, c) => (r < n / 2 ? [n - 1 - r, c] : null)); break;
    case "side-by-side": add((r, c) => (c % 2 === 0 && c + 1 < n ? [r, c + 1] : null)); break;
    case "stacked": add((r, c) => (r % 2 === 0 && r + 1 < n ? [r + 1, c] : null)); break;
    case "row-leap": add((r, c) => (c + 2 < n && Math.floor(c / 2) % 2 === 0 ? [r, c + 2] : null)); break;
    case "column-leap": add((r, c) => (r + 2 < n && Math.floor(r / 2) % 2 === 0 ? [r + 2, c] : null)); break;
    case "box-diagonal": for (const b of boxes(n)) if (b.length === 4) out.push([b[0]!, b[3]!], [b[1]!, b[2]!]); break;
  }
  return out;
}
const pairOff = (x: number, p: PairSumsParams) => (p.every ? circ(x - p.total, p.every) : Math.abs(x - p.total));
const targetWords = (p: PairSumsParams, cap: number) => {
  if (!p.every) return `${p.total}`;
  const xs: number[] = []; for (let x = p.total; x <= 2 * cap; x += p.every) xs.push(x);
  return xs.length === 1 ? `${xs[0]}` : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
};

export function pairSums(n: number, cap = 9): RuleFamily<GridState, PairSumsParams> {
  const ps = (p: Pairing) => pairingCells(n, p);
  const shape: Shape<PairSumsParams> = {
    main: distance<PairSumsParams>("pair-sums", "pairs adding up to the target", p => `Every cell and ${PAIR_WORDS[p.pairing]} should add up to ${targetWords(p, cap)}${NO_REPEATS}.`, "cells"),
    tieBreakers: [
      more<PairSumsParams>("differ-by-3s", "pairs differing by a multiple of 3", () => "In as many pairs as possible the two numbers should differ by a multiple of 3.", "cells"),
      more<PairSumsParams>("equal-pairs", "pairs of equal numbers", () => "As many pairs as possible should be two equal numbers.", "cells"),
      more<PairSumsParams>("shared-factor", "pairs sharing a factor", () => "As many pairs as possible should share a factor bigger than 1.", "cells"),
    ],
  };
  const params = (v: Variant): PairSumsParams[] => (gridParams(v).size === 4 ? PS_DEALT.map(([pairing, total, every]) => (every === null ? { pairing, total } : { pairing, total, every })) : [{ pairing: "half-turn", total: 1 }]);
  return family<PairSumsParams>("pair-sums", "Pair Sums", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), pr = ps(p.pairing), v = cells.v;
    const off = pr.map(([a, b]) => pairOff(v[a]! + v[b]!, p));
    ctx.term("pair-sums", "how far each pair's total is from the target, added up, and the repeated rows and columns", Q(sum(off) + repeats(n, cells.v)), cells.refs);
    focusUnits(ctx, cells, pr, k => off[k] === 0);
    ctx.term("differ-by-3s", "pairs differing by a multiple of 3", Q(pr.filter(([a, b]) => Math.abs(v[a]! - v[b]!) % 3 === 0).length), cells.refs);
    ctx.term("equal-pairs", "pairs of equal numbers", Q(pr.filter(([a, b]) => v[a] === v[b]).length), cells.refs);
    ctx.term("shared-factor", "pairs sharing a factor", Q(pr.filter(([a, b]) => v[a]! > 1 && v[b]! > 1 && gcd(v[a]!, v[b]!) > 1).length), cells.refs);
  }, n);
}

/** The parameterised families, in the order the pool lists them (undealt: in no preset). */
export const paramGridFamilies = (n: number): readonly RuleFamily<GridState, any>[] => [magicTotals(n), spreadFamily(n), numberLines(n), pairSums(n)];

// ---------------------------------------------------------------- the dealt (value, tie-breaker) pairs

/**
 * Each family deals a (value, tie-breaker) pair only where the 100-move first-improvement climber (±1 on a cell or a
 * swap, 64 starts from π boards) reaches a median within ±0.5 bits of one common band, 17 bits, for the main part and
 * that tie-breaker as dealt (bits from 4M π boards). The tie-breakers moved reach by up to 5 bits (gate of #713), so the
 * band is per pair. A digit string lists the tie-breakers dealt with a value, by their index in the family's list.
 */
const MT_DEALT: readonly (readonly [TotalUnits, number, number, string])[] = [
  ["columns-boxes", 6, 0, "01"], ["columns-boxes", 6, 1, "0"], ["columns-boxes", 6, 2, "0"],
  ["columns-boxes", 6, 4, "0"], ["columns-boxes", 6, 5, "0"], ["columns-boxes", 7, 1, "012"],
  ["columns-boxes", 7, 2, "1"], ["columns-boxes", 7, 3, "12"], ["columns-boxes", 7, 4, "01"],
  ["columns-boxes", 7, 5, "012"], ["columns-boxes", 8, 0, "2"], ["columns-boxes", 8, 5, "1"],
  ["columns-boxes", 9, 1, "2"], ["columns-boxes", 9, 2, "2"], ["columns-boxes", 9, 3, "2"],
  ["columns-boxes", 9, 4, "2"], ["columns-boxes", 9, 5, "2"], ["columns-boxes", 9, 8, "2"],
  ["columns-boxes", 10, 1, "2"], ["columns-boxes", 10, 2, "0"], ["columns-boxes", 10, 7, "2"],
  ["columns-boxes", 10, 8, "2"], ["columns-boxes", 11, 1, "0"], ["columns-boxes", 11, 2, "2"],
  ["columns-boxes", 11, 3, "2"], ["columns-boxes", 11, 4, "2"], ["columns-boxes", 11, 6, "2"],
  ["columns-boxes", 11, 7, "2"], ["columns-boxes", 11, 8, "2"], ["columns-boxes", 11, 9, "2"],
  ["columns-boxes", 11, 10, "0"], ["columns-boxes", 12, 3, "2"], ["columns-boxes", 12, 5, "2"],
  ["columns-boxes", 12, 6, "2"], ["columns-boxes", 12, 9, "2"], ["rows-boxes", 6, 1, "0"],
  ["rows-boxes", 6, 2, "0"], ["rows-boxes", 6, 4, "0"], ["rows-boxes", 6, 5, "0"], ["rows-boxes", 7, 0, "12"],
  ["rows-boxes", 7, 1, "12"], ["rows-boxes", 7, 2, "012"], ["rows-boxes", 7, 3, "0"], ["rows-boxes", 7, 4, "0"],
  ["rows-boxes", 7, 5, "1"], ["rows-boxes", 7, 6, "01"], ["rows-boxes", 8, 0, "2"], ["rows-boxes", 8, 3, "01"],
  ["rows-boxes", 8, 4, "01"], ["rows-boxes", 8, 5, "2"], ["rows-boxes", 8, 6, "2"], ["rows-boxes", 9, 1, "02"],
  ["rows-boxes", 9, 2, "2"], ["rows-boxes", 9, 3, "2"], ["rows-boxes", 9, 4, "2"], ["rows-boxes", 9, 5, "2"],
  ["rows-boxes", 9, 8, "2"], ["rows-boxes", 10, 0, "2"], ["rows-boxes", 10, 1, "2"], ["rows-boxes", 10, 9, "2"],
  ["rows-boxes", 11, 1, "0"], ["rows-boxes", 11, 2, "02"], ["rows-boxes", 11, 3, "2"], ["rows-boxes", 11, 4, "2"],
  ["rows-boxes", 11, 5, "2"], ["rows-boxes", 11, 6, "2"], ["rows-boxes", 11, 7, "2"], ["rows-boxes", 11, 9, "02"],
  ["rows-boxes", 11, 10, "2"], ["rows-boxes", 12, 0, "2"], ["rows-boxes", 12, 3, "2"], ["rows-boxes", 12, 4, "2"],
  ["rows-boxes", 12, 5, "2"], ["rows-boxes", 12, 8, "2"], ["rows-boxes", 12, 9, "0"], ["rows-boxes", 12, 10, "2"],
  ["rows-columns", 5, 0, "0"], ["rows-columns", 5, 2, "01"], ["rows-columns", 5, 4, "012"],
  ["rows-columns", 6, 5, "0"], ["rows-columns", 8, 0, "2"], ["rows-columns", 8, 7, "0"],
  ["rows-columns", 9, 0, "02"], ["rows-columns", 9, 1, "2"], ["rows-columns", 9, 2, "02"],
  ["rows-columns", 9, 5, "0"], ["rows-columns", 9, 6, "2"], ["rows-columns", 9, 7, "02"],
  ["rows-columns", 10, 2, "0"], ["rows-columns", 10, 4, "2"], ["rows-columns", 10, 7, "0"],
  ["rows-columns", 11, 7, "0"], ["rows-columns", 12, 0, "2"], ["rows-columns", 12, 2, "2"],
  ["rows-columns", 12, 5, "0"], ["rows-columns", 12, 6, "0"], ["rows-columns", 12, 7, "2"],
  ["rows-columns", 12, 9, "2"],
];
const SPREAD_DEALT: readonly (readonly [SpreadWindows, number, string])[] = [
  ["column-triples", 1, "012"], ["column-triples", 4, "1"], ["row-triples", 1, "012"], ["row-triples", 4, "1"],
  ["squares-column-triples", 3, "02"], ["squares-columns", 4, "0"], ["squares-row-triples", 3, "02"],
  ["squares-rows", 4, "1"], ["squares", 6, "1"],
];
const NL_DEALT: readonly (readonly [NumberAxis, number, number, string])[] = [
  ["columns", 9, 4, "1"], ["columns", 9, 5, "1"], ["columns", 9, 8, "1"], ["columns", 11, 2, "1"],
  ["columns", 11, 6, "2"], ["rows-columns", 9, 2, "0"], ["rows-columns", 9, 3, "0"], ["rows-columns", 9, 5, "2"],
  ["rows-columns", 11, 0, "0"], ["rows-columns", 11, 10, "0"], ["rows-columns", 13, 0, "1"],
  ["rows-columns", 13, 1, "12"], ["rows-columns", 13, 2, "02"], ["rows-columns", 13, 3, "02"],
  ["rows-columns", 13, 4, "02"], ["rows-columns", 13, 5, "012"], ["rows-columns", 13, 6, "1"],
  ["rows-columns", 13, 7, "02"], ["rows-columns", 13, 8, "2"], ["rows-columns", 13, 9, "012"],
  ["rows-columns", 13, 10, "1"], ["rows-columns", 13, 11, "1"], ["rows-columns", 13, 12, "0"], ["rows", 9, 2, "1"],
  ["rows", 9, 3, "1"], ["rows", 9, 8, "1"], ["rows", 11, 0, "1"], ["rows", 11, 3, "1"], ["rows", 11, 4, "1"],
  ["rows", 11, 5, "1"], ["rows", 11, 7, "1"], ["rows", 11, 10, "1"], ["rows", 13, 1, "1"], ["rows", 13, 2, "1"],
  ["rows", 13, 3, "1"], ["rows", 13, 10, "1"], ["rows", 13, 12, "1"],
];
const PS_DEALT: readonly (readonly [Pairing, number, number | null, string])[] = [
  ["box-diagonal", 4, 5, "12"], ["box-diagonal", 4, 6, "1"], ["box-diagonal", 5, 6, "2"],
  ["box-diagonal", 5, 8, "01"], ["box-diagonal", 6, 8, "2"], ["box-diagonal", 6, 11, "0"],
  ["box-diagonal", 7, 9, "1"], ["box-diagonal", 7, 10, "01"], ["column-leap", 4, 5, "0"],
  ["column-leap", 4, 6, "02"], ["column-leap", 5, 6, "2"], ["column-leap", 5, 8, "02"],
  ["column-leap", 6, 11, "012"], ["column-leap", 7, 9, "01"], ["column-leap", 7, 10, "1"],
  ["column-mirror", 4, 5, "02"], ["column-mirror", 4, 6, "012"], ["column-mirror", 5, 6, "2"],
  ["column-mirror", 5, 8, "2"], ["column-mirror", 6, 8, "2"], ["column-mirror", 6, 11, "01"],
  ["column-mirror", 7, 9, "01"], ["column-mirror", 7, 10, "01"], ["half-turn", 4, 5, "2"], ["half-turn", 4, 6, "0"],
  ["half-turn", 5, 6, "2"], ["half-turn", 5, 8, "2"], ["half-turn", 6, 8, "2"], ["half-turn", 7, 9, "1"],
  ["half-turn", 7, 10, "01"], ["row-leap", 4, 5, "02"], ["row-leap", 4, 6, "1"], ["row-leap", 5, 6, "2"],
  ["row-leap", 5, 8, "02"], ["row-leap", 6, 8, "2"], ["row-leap", 7, 10, "0"], ["row-mirror", 4, 5, "2"],
  ["row-mirror", 4, 6, "02"], ["row-mirror", 5, 6, "2"], ["row-mirror", 5, 8, "2"], ["row-mirror", 6, 8, "0"],
  ["row-mirror", 7, 9, "01"], ["row-mirror", 7, 10, "01"], ["side-by-side", 4, 6, "1"], ["side-by-side", 5, 6, "2"],
  ["side-by-side", 5, 8, "01"], ["side-by-side", 6, 8, "2"], ["side-by-side", 6, 11, "2"],
  ["side-by-side", 7, 9, "1"], ["side-by-side", 7, 10, "01"], ["stacked", 4, 5, "12"], ["stacked", 5, 6, "2"],
  ["stacked", 5, 8, "1"], ["stacked", 7, 9, "0"], ["stacked", 7, 10, "01"],
];

const tbIds = (fam: { tieBreakers: readonly { id: string }[] }, code: string) => [...code].map(c => fam.tieBreakers[Number(c)]!.id);
export interface DealtPair<P> { readonly params: P; readonly tieBreakers: readonly string[] }
/** The dealt (value, tie-breakers) pairs per family: a preset deals exactly these. */
export const PARAM_DEALT: {
  readonly "magic-totals": readonly DealtPair<MagicTotalsParams>[]; readonly spread: readonly DealtPair<SpreadParams>[];
  readonly "number-lines": readonly DealtPair<NumberLinesParams>[]; readonly "pair-sums": readonly DealtPair<PairSumsParams>[];
} = (() => {
  const [mt, sp, nl, ps] = paramGridFamilies(4);
  return {
    "magic-totals": MT_DEALT.map(([units, q, r, c]) => ({ params: { units, q, r }, tieBreakers: tbIds(mt!, c) })),
    spread: SPREAD_DEALT.map(([windows, s, c]) => ({ params: { windows, s }, tieBreakers: tbIds(sp!, c) })),
    "number-lines": NL_DEALT.map(([axis, q, r, c]) => ({ params: { axis, q, r }, tieBreakers: tbIds(nl!, c) })),
    "pair-sums": PS_DEALT.map(([pairing, total, every, c]) => ({ params: every === null ? { pairing, total } : { pairing, total, every }, tieBreakers: tbIds(ps!, c) })),
  };
})();

// ---------------------------------------------------------------- drift neighbourhoods

/**
 * How far apart two values of a family are for a redraw (parameter drift). The weights put first what kept a moderate
 * share of a good board's bits in the drift measurements: the twin units of Magic Totals (rows ↔ columns), other windows
 * with the same spread, the next remainder of Number Lines, the next total of Pair Sums on the same pairing.
 */
function driftDistance(familyId: string, a: any, b: any): number {
  switch (familyId) {
    case "magic-totals": return (a.units !== b.units ? 1 : 0) + (a.r !== b.r ? 2 : 0) + (a.q !== b.q ? 3 : 0);
    case "spread": return (a.windows !== b.windows ? 1 : 0) + 2 * Math.abs(a.s - b.s);
    case "number-lines": return (a.q === b.q ? Math.min(Math.abs(a.r - b.r), a.q - Math.abs(a.r - b.r)) : 4) + (a.axis !== b.axis ? 3 : 0);
    case "pair-sums": return (a.pairing !== b.pairing ? 3 : 0) + Math.abs(a.total - b.total) + ((a.every ?? 0) !== (b.every ?? 0) ? 1 : 0);
    default: return Infinity;
  }
}
const dealtOf = (familyId: string): readonly DealtPair<unknown>[] => (PARAM_DEALT as Record<string, readonly DealtPair<unknown>[]>)[familyId] ?? [];
/**
 * The values a redraw may move a dealt value to: the values dealt with the same tie-breaker (any, when none is given) at
 * distance at most the larger of the two values' distances to their own nearest such value. Symmetric, never the value
 * itself, never empty while the tie-breaker deals another value, every neighbour dealt.
 */
export function gridDriftNeighbours(familyId: string, params: unknown, tieBreaker?: string): unknown[] {
  const pool = dealtOf(familyId).filter(d => tieBreaker === undefined || d.tieBreakers.includes(tieBreaker)).map(d => d.params);
  const key = JSON.stringify(params);
  if (!pool.some(x => JSON.stringify(x) === key)) return [];
  const others = (x: unknown) => pool.filter(y => JSON.stringify(y) !== JSON.stringify(x));
  const radius = (x: unknown) => Math.min(...others(x).map(y => driftDistance(familyId, x, y)));
  const r = radius(params);
  return others(params).filter(y => driftDistance(familyId, params, y) <= Math.max(r, radius(y)));
}
