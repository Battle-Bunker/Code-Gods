/**
 * Parameterised grid families (owner decisions 40–42; trials declared by the coordinator, undealt until gated): one shared
 * relation per card with one or two dealt numbers, plus the units it reads. Each family's dealt values are of equal reach
 * in play (a 100-move climber from π boards reaches the same median bits within ±0.5), and a redraw (parameter drift)
 * moves to a neighbouring value (`gridDriftNeighbours`) so that a moderate share of a good board's bits survives it.
 *
 * - Magic Totals: the residue family (Magic Accountant and Magic Eighteen folded in), totals leaving r when divided by q.
 * - Spread: windows (2×2 squares, three-in-a-rows, whole rows or columns) with a spread of exactly s.
 * - Number Lines: each row (or column) read as one number, as close as possible to a number leaving r when divided by q.
 * - Pair Sums: Opposite Nines' card shape over eight pairings, with small targets (the 37-bit "add up to 9" is not dealt).
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

// ---------------------------------------------------------------- 1. Magic Totals (the residue family)

export type TotalUnits = "rows-columns" | "rows-boxes" | "columns-boxes";
export type MagicTotalsParams = { units: TotalUnits; q: number; r: number };
const TOTAL_WORDS: Record<TotalUnits, string> = { "rows-columns": "Every row's and every column's total", "rows-boxes": "Every row's and every corner box's total", "columns-boxes": "Every column's and every corner box's total" };
const totalUnits = (n: number, u: TotalUnits) => u === "rows-columns" ? [...rows(n), ...cols(n)] : u === "rows-boxes" ? [...rows(n), ...boxes(n)] : [...cols(n), ...boxes(n)];
/** The 19 values of equal reach (median 14.6–15.6 bits): rows and columns mod 8 or 12; rows or columns with boxes mod 6, 10 or 12. */
export const MAGIC_TOTALS: readonly MagicTotalsParams[] = [
  ...[1, 2, 6].map(r => ({ units: "rows-columns" as const, q: 8, r })), ...[9, 10].map(r => ({ units: "rows-columns" as const, q: 12, r })),
  ...([[6, [1, 3, 5]], [10, [1, 9]], [12, [3, 11]]] as const).flatMap(([q, rs]) => rs.flatMap(r => (["rows-boxes", "columns-boxes"] as const).map(units => ({ units, q, r })))),
];

export function magicTotals(n: number): RuleFamily<GridState, MagicTotalsParams> {
  const shape: Shape<MagicTotalsParams> = {
    main: distance<MagicTotalsParams>("totals", "totals leaving the dealt remainder", p => `${TOTAL_WORDS[p.units]} should ${leaves(p.r, p.q)}.`, "cells"),
    tieBreakers: [
      more<MagicTotalsParams>("same-quotient", "totals giving the same whole number when divided", p => `Those totals divided by ${p.q} should give the same whole number as often as possible.`, "cells"),
      distance<MagicTotalsParams>("small-totals", "those totals added up", () => "Those totals should add up to as little as possible.", "cells"),
      more<MagicTotalsParams>("different-totals", "different totals", () => "Those totals should be as many different numbers as possible.", "cells"),
    ],
  };
  const params = (v: Variant): MagicTotalsParams[] => (gridParams(v).size === 4 ? [...MAGIC_TOTALS] : [{ units: "rows-columns", q: 3, r: 1 }]);
  return family<MagicTotalsParams>("magic-totals", "Magic Totals", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), units = totalUnits(n, p.units), totals = units.map(u => sum(u.map(i => cells.v[i]!)));
    const off = totals.map(t => circ(t - p.r, p.q));
    ctx.term("totals", "how far the totals are from leaving the remainder, added up", Q(sum(off)), cells.refs);
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
/** The 10 values of equal reach (median 14.6–15.5 bits). */
export const SPREADS: readonly SpreadParams[] = [
  { windows: "squares-rows", s: 4 }, { windows: "squares-columns", s: 4 }, { windows: "row-triples", s: 2 }, { windows: "column-triples", s: 2 },
  { windows: "row-triples", s: 3 }, { windows: "column-triples", s: 3 }, { windows: "squares", s: 1 }, { windows: "squares", s: 5 },
  { windows: "squares-row-triples", s: 3 }, { windows: "squares-column-triples", s: 3 },
];
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
      p => `${SPREAD_WORDS[p.windows]} should have a spread of exactly ${p.s}: its biggest number ${p.s} more than its smallest.`, "cells"),
    tieBreakers: [
      more<SpreadParams>("extremes-apart", "windows with their biggest and smallest far apart",
        () => "In as many of them as possible the biggest and the smallest number should sit as far apart as they can: across a square's diagonal, at the ends of a row of cells.", "cells"),
      distance<SpreadParams>("low-floor", "their smallest numbers added up", () => "Their smallest numbers should add up to as little as possible.", "cells"),
      more<SpreadParams>("all-different", "windows of all different numbers", () => "As many of them as possible should hold all different numbers.", "cells"),
    ],
  };
  const params = (v: Variant): SpreadParams[] => (gridParams(v).size === 4 ? [...SPREADS] : [{ windows: "squares", s: 1 }]);
  return family<SpreadParams>("spread", "Spread", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), ws = spreadWindows(n, p.windows), vs = ws.map(w => w.cells.map(i => cells.v[i]!));
    const off = vs.map(x => Math.abs(spreadOf(x) - p.s));
    ctx.term("spread", "how far each window's spread is from the dealt one, added up", Q(sum(off)), cells.refs);
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
/** The 20 values of equal reach (median 14.1–14.9 bits). */
export const NUMBER_LINES: readonly NumberLinesParams[] = [
  ...[3, 4, 5, 6, 7, 8].flatMap(r => (["rows", "columns"] as const).map(axis => ({ axis, q: 11, r }))),
  { axis: "rows-columns", q: 11, r: 3 }, { axis: "rows-columns", q: 11, r: 8 },
  ...[1, 7, 8].flatMap(r => (["rows", "columns"] as const).map(axis => ({ axis, q: 13, r }))),
];
const axisUnits = (n: number, a: NumberAxis) => (a === "rows" ? rows(n) : a === "columns" ? cols(n) : [...rows(n), ...cols(n)]);
const numberOf = (ds: readonly number[]) => ds.reduce((t, d) => t * 10 + d, 0);
/** The nearest number leaving r when divided by q (the smaller on a tie). */
const nearestLeaving = (x: number, q: number, r: number) => { const m = (((x - r) % q) + q) % q; return m <= q - m ? x - m : x + q - m; };

export function numberLines(n: number): RuleFamily<GridState, NumberLinesParams> {
  const shape: Shape<NumberLinesParams> = {
    main: distance<NumberLinesParams>("numbers", "numbers close to the dealt remainder",
      p => `${AXIS_WORDS[p.axis]}: each should be as close as possible to a number that ${thatLeaves(p.r, p.q)}.`, "cells"),
    tieBreakers: [
      more<NumberLinesParams>("same-last-digit", "nearest such numbers ending in the commonest digit", () => "The nearest such numbers should end in the same digit as often as possible.", "cells"),
      more<NumberLinesParams>("big-leads", "the numbers' first digits added up", () => "Those numbers should start with digits as big as possible (their first digits added up).", "cells"),
      more<NumberLinesParams>("shared-factors", "neighbouring numbers sharing a factor", p => `Neighbouring ${p.axis === "columns" ? "columns'" : p.axis === "rows" ? "rows'" : "rows' (and columns')"} numbers should share a factor bigger than 1 as often as possible.`, "cells"),
    ],
  };
  const params = (v: Variant): NumberLinesParams[] => (gridParams(v).size === 4 ? [...NUMBER_LINES] : [{ axis: "rows", q: 7, r: 1 }]);
  return family<NumberLinesParams>("number-lines", "Number Lines", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), units = axisUnits(n, p.axis), nums = units.map(u => numberOf(u.map(i => cells.v[i]!)));
    const off = nums.map(x => circ(x - p.r, p.q));
    ctx.term("numbers", "how far each number is from one leaving the remainder, added up", Q(sum(off)), cells.refs);
    focusUnits(ctx, cells, units, k => off[k] === 0);
    ctx.term("same-last-digit", "nearest such numbers ending in the commonest digit", Q(mostCommon(nums.map(x => nearestLeaving(x, p.q, p.r) % 10))), cells.refs);
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
/**
 * The four relations of equal reach (median 22.9–23.6 bits): add up to 0, 9 or 18; to 1; to 2; to 3. ("4, 11 or 18" was
 * dropped: climbers split between 13.8 and 23.5 bits on it. "2 or 14" and the like were dropped as near-copies of "2".)
 */
export const PAIR_TARGETS: readonly { total: number; every?: number }[] = [{ total: 0, every: 9 }, { total: 1 }, { total: 2 }, { total: 3 }];
export const PAIR_SUMS: readonly PairSumsParams[] = PAIRINGS.flatMap(pairing => PAIR_TARGETS.map(t => ({ pairing, ...t })));
const pairOff = (x: number, p: PairSumsParams) => (p.every ? circ(x - p.total, p.every) : Math.abs(x - p.total));
const targetWords = (p: PairSumsParams, cap: number) => {
  if (!p.every) return `${p.total}`;
  const xs: number[] = []; for (let x = p.total; x <= 2 * cap; x += p.every) xs.push(x);
  return xs.length === 1 ? `${xs[0]}` : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
};

export function pairSums(n: number, cap = 9): RuleFamily<GridState, PairSumsParams> {
  const ps = (p: Pairing) => pairingCells(n, p);
  const shape: Shape<PairSumsParams> = {
    main: distance<PairSumsParams>("pair-sums", "pairs adding up to the target", p => `Every cell and ${PAIR_WORDS[p.pairing]} should add up to ${targetWords(p, cap)}.`, "cells"),
    tieBreakers: [
      more<PairSumsParams>("differ-by-3s", "pairs differing by a multiple of 3", () => "In as many pairs as possible the two numbers should differ by a multiple of 3.", "cells"),
      more<PairSumsParams>("equal-pairs", "pairs of equal numbers", () => "As many pairs as possible should be two equal numbers.", "cells"),
      more<PairSumsParams>("shared-factor", "pairs sharing a factor", () => "As many pairs as possible should share a factor bigger than 1.", "cells"),
    ],
  };
  const params = (v: Variant): PairSumsParams[] => (gridParams(v).size === 4 ? [...PAIR_SUMS] : [{ pairing: "half-turn", total: 1 }]);
  return family<PairSumsParams>("pair-sums", "Pair Sums", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), pr = ps(p.pairing), v = cells.v;
    const off = pr.map(([a, b]) => pairOff(v[a]! + v[b]!, p));
    ctx.term("pair-sums", "how far each pair's total is from the target, added up", Q(sum(off)), cells.refs);
    focusUnits(ctx, cells, pr, k => off[k] === 0);
    ctx.term("differ-by-3s", "pairs differing by a multiple of 3", Q(pr.filter(([a, b]) => Math.abs(v[a]! - v[b]!) % 3 === 0).length), cells.refs);
    ctx.term("equal-pairs", "pairs of equal numbers", Q(pr.filter(([a, b]) => v[a] === v[b]).length), cells.refs);
    ctx.term("shared-factor", "pairs sharing a factor", Q(pr.filter(([a, b]) => v[a]! > 1 && v[b]! > 1 && gcd(v[a]!, v[b]!) > 1).length), cells.refs);
  }, n);
}

/** The parameterised families, in the order the pool lists them (undealt: in no preset). */
export const paramGridFamilies = (n: number): readonly RuleFamily<GridState, any>[] => [magicTotals(n), spreadFamily(n), numberLines(n), pairSums(n)];

// ---------------------------------------------------------------- drift neighbourhoods

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
/**
 * The values a redraw may move a dealt value to (parameter drift), chosen so that a moderate share of a good board's bits
 * survives (measured median over 120 redraws: Magic Totals 0.34, Spread 0.27, Number Lines 0.43, Pair Sums 0.27):
 * - Magic Totals: the same q and r on the twin units (rows ↔ columns with boxes); the rows-and-columns values, which
 *   have no twin, move to another r of the same q.
 * - Spread: the same s on other windows; the squares-only values (s 1 and 5), which have no peer, swap s.
 * - Number Lines: the same axis and q with r one up or down; a value with no such neighbour moves to another axis with the
 *   same q and r (and back).
 * - Pair Sums: the same pairing, with the target's smallest total one up or down (0, 1, 2, 3).
 * Symmetric, never the value itself, every neighbour dealable on the 4×4 board.
 */
export function gridDriftNeighbours(familyId: string, params: unknown): unknown[] {
  if (familyId === "magic-totals") {
    const p = params as MagicTotalsParams;
    const twins = MAGIC_TOTALS.filter(x => !same(x, p) && x.q === p.q && x.r === p.r);
    return twins.length ? twins : MAGIC_TOTALS.filter(x => !same(x, p) && x.units === p.units && x.q === p.q);
  }
  if (familyId === "spread") {
    const p = params as SpreadParams;
    const peers = SPREADS.filter(x => !same(x, p) && x.s === p.s);
    return peers.length ? peers : SPREADS.filter(x => !same(x, p) && x.windows === p.windows);
  }
  if (familyId === "number-lines") {
    const p = params as NumberLinesParams;
    const steps = (x: NumberLinesParams) => NUMBER_LINES.filter(y => y.axis === x.axis && y.q === x.q && Math.abs(y.r - x.r) === 1);
    const lone = (x: NumberLinesParams) => steps(x).length === 0;
    return [...steps(p), ...NUMBER_LINES.filter(x => !same(x, p) && x.axis !== p.axis && x.q === p.q && x.r === p.r && (lone(p) || lone(x)))];
  }
  if (familyId === "pair-sums") {
    const p = params as PairSumsParams;
    return PAIR_SUMS.filter(x => x.pairing === p.pairing && Math.abs(x.total - p.total) === 1);
  }
  return [];
}
