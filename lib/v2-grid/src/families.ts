/**
 * The grid's first rule pool (docs/engine-v2/grids.md §6): six families, each a main layer in one representation and in
 * a 12-year-old's words, and three alternative tie-breakers; a dealt rule is the main layer plus one (owner decision 14).
 * Every layer is graded (decision 13), and every layer of a family adds up over the family's units (sums.ts), so every
 * pairing has an exact value (§5).
 */
import { q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { at, cellName, type GridState } from "./grid.ts";
import { boxes, corners, pairs, rows } from "./units.ts";

type Ctx = EvalContext<GridState>;
type L<P> = Layer<P>;

const ns = (...xs: number[]): Q[] => xs.map(x => q(x));
const within = (what: string) => (t: Q) => (t.n === 0n ? `${what} exactly` : `${what} off by at most ${t.n} in all`);
const atLeast = (what: string) => (t: Q) => `${what} at least ${t.n}`;

function distance<P>(id: string, title: string, sentence: (p: P) => string, rep: string, thresholds: readonly number[], what: string): L<P> {
  return { id, title, sentence, rep, sense: "min", measure: "distance", thresholds: () => ns(...thresholds), rungLabel: within(what) };
}
function more<P>(id: string, title: string, sentence: string, rep: string, thresholds: readonly number[], what: string, measure: "count" | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max", measure, thresholds: () => ns(...thresholds), rungLabel: atLeast(what) };
}

interface Shape<P> { readonly main: L<P>; readonly tieBreakers: readonly L<P>[] }
function card<P>(f: Shape<P>, p: P, tb: TieBreaker): string {
  const t = tb === null ? undefined : f.tieBreakers.find(x => x.id === tb);
  return t ? `${f.main.sentence(p)} Tie-breaker: ${t.sentence(p)}` : f.main.sentence(p);
}
function family<P extends object>(id: string, title: string, depends: string[], shape: Shape<P>, params: P[], evaluate: (ctx: Ctx, p: P, n: number) => void, n: number): RuleFamily<GridState, P> {
  return { id, title, card: (p, tb) => card(shape, p, tb), params: [], dealable: () => params, depends, ...shape, evaluate: (ctx, p) => evaluate(ctx, p, n) };
}

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);
export const isPrimeCell = (x: number): boolean => PRIMES.has(x);

/** Read every cell: the board's numbers, and each cell's ref (for terms and marks). */
function readCells(ctx: Ctx, n: number): { v: number[]; refs: ElementRef[] } {
  const refs = Array.from({ length: n * n }, (_, i) => ref("cells", cellName(n, i)));
  return { v: refs.map(r => Number((ctx.read(r) as { q: Q }).q.n)), refs };
}
const readNum = (ctx: Ctx, r: ElementRef): number => Number((ctx.read(r) as { q: Q }).q.n);

/** A count over cells (primes, zeros, odd numbers, 7s): records the term and focuses the cells it counts. */
function countCells(ctx: Ctx, id: string, label: string, cells: { v: number[]; refs: ElementRef[] }, test: (x: number) => boolean, focus: boolean): void {
  const hit = cells.v.flatMap((x, i) => (test(x) ? [i] : []));
  ctx.term(id, label, q(hit.length), cells.refs);
  if (focus) for (const i of hit) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
}
/** A total over some cells (the first column, the corners, the top half). */
function totalOf(ctx: Ctx, id: string, label: string, cells: { v: number[]; refs: ElementRef[] }, which: readonly number[]): void {
  ctx.term(id, label, q(which.reduce((t, i) => t + cells.v[i]!, 0)), which.map(i => cells.refs[i]!));
}

/** Tie-breakers several families share; each family sets their rungs so that its dealt top is in the band. */
const primesTie = <P,>(ts: readonly number[]): L<P> => more("primes", "prime numbers on the board", "As many cells as possible should hold a prime number (2, 3, 5 or 7).", "cells", ts, "prime numbers", "count");
const zerosTie = <P,>(ts: readonly number[]): L<P> => more("zeros", "0s on the board", "As many cells as possible should hold 0.", "cells", ts, "0s", "count");

// ---------------------------------------------------------------- 1. Row Totals

type T = { T: number };
export function rowTotals(n: number): RuleFamily<GridState, T> {
  const shape: Shape<T> = {
    main: distance<T>("rows", "every row adds up to the target", p => `Every row should add up to ${p.T}.`, "tally", [16, 12, 8, 6, 4, 3, 2, 1, 0], "the rows' totals"),
    tieBreakers: [
      more("first-column", "the first column's total", "The first column should add up to as much as possible.", "cells", [12, 16, 20, 22, 24, 26], "the first column"),
      primesTie([5, 6, 8, 10, 11, 12]), zerosTie([1, 2, 3, 4, 5, 6]),
    ],
  };
  return family<T>("row-totals", "Row Totals", ["tally", "cells"], shape, [{ T: 12 }], (ctx, p) => {
    const rs = rows(n).map((_, r) => ref("tally", `row${r}`));
    const totals = rs.map(r => readNum(ctx, r));
    ctx.term("rows", `how far the rows' totals are from ${p.T}, added up`, q(totals.reduce((t, x) => t + Math.abs(x - p.T), 0)), rs);
    rs.forEach((r, i) => { const d = totals[i]! - p.T; ctx.mark(d === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: d < 0 ? `${-d} short` : `${d} over` }); });
    const cells = readCells(ctx, n);
    totalOf(ctx, "first-column", "the first column's total", cells, rows(n).map((_, r) => at(n, r, 0)));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 2. Opposite Pairs

export function oppositePairs(n: number): RuleFamily<GridState, T> {
  const ps = pairs(n);
  const shape: Shape<T> = {
    main: distance<T>("pairs", "every cell and its opposite add up to the target",
      p => `Every cell and its opposite (where a half turn of the board takes it) should add up to ${p.T}.`, "turn", [32, 24, 20, 16, 14, 12, 10], "the pairs' totals"),
    tieBreakers: [
      more("top-half", "the top half's total", "The top half of the board should add up to as much as possible.", "cells", [24, 30, 36, 42, 46, 50], "the top half"),
      primesTie([6, 8, 10, 11, 12, 13]),
      more("odd", "odd numbers on the board", "As many cells as possible should hold an odd number.", "cells", [6, 8, 10, 11, 12, 13], "odd numbers", "count"),
    ],
  };
  return family<T>("opposite-pairs", "Opposite Pairs", ["turn", "cells"], shape, [{ T: 9 }], (ctx, p) => {
    const rs = ps.map((_, k) => ref("turn", `pair${k}`));
    const totals = rs.map(r => readNum(ctx, r));
    ctx.term("pairs", `how far each pair's total is from ${p.T}, added up`, q(totals.reduce((t, x) => t + Math.abs(x - p.T), 0)), rs);
    rs.forEach((r, i) => { if (totals[i] === p.T) ctx.mark({ kind: "focus", ref: r }); else ctx.mark({ kind: "note", ref: r, text: `${totals[i]}` }); });
    const cells = readCells(ctx, n);
    totalOf(ctx, "top-half", "the top half's total", cells, ps.map(([a]) => a));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "odd", "odd numbers on the board", cells, x => x % 2 === 1, false);
  }, n);
}

// ---------------------------------------------------------------- 3. Mirror Rows

type None = Record<string, never>;
export function mirrorRows(n: number): RuleFamily<GridState, None> {
  const middle = rows(n).flatMap((_, r) => Array.from({ length: n - 2 }, (_, j) => at(n, r, j + 1)));
  const shape: Shape<None> = {
    main: distance<None>("mirror", "every row reads the same backwards", () => "Every row should read the same backwards, like 3 1 1 3.", "mirror", [16, 12, 8, 6, 4, 3, 2, 1], "the rows' mirror gaps"),
    tieBreakers: [
      more("middle", "the middle columns' total", "The middle two columns should add up to as much as possible.", "cells", [8, 12, 16, 20, 24, 28], "the middle columns"),
      primesTie([4, 6, 8, 9, 10, 11]),
      zerosTie([6, 8, 10, 11, 12, 13, 14]),
    ],
  };
  return family<None>("mirror-rows", "Mirror Rows", ["mirror", "cells"], shape, [{}], ctx => {
    const gs = rows(n).map((_, r) => ref("mirror", `gap${r}`));
    const gaps = gs.map(r => readNum(ctx, r));
    ctx.term("mirror", "how far the rows are from reading the same backwards, added up", q(gaps.reduce((t, x) => t + x, 0)), gs);
    gs.forEach((r, i) => ctx.mark(gaps[i] === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: `off by ${gaps[i]}` }));
    const cells = readCells(ctx, n);
    totalOf(ctx, "middle", "the middle columns' total", cells, middle);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 4. Steady Steps

export function steadySteps(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: distance<None>("steady", "every row goes up or down in equal steps",
      () => "Along every row the numbers should go up (or down) in equal steps, like 1 3 5 7.", "steps", [16, 12, 10, 8, 6, 5, 4, 3], "the rows' uneven steps"),
    tieBreakers: [
      more("climb", "how far the rows climb", "Each row should climb (or fall) as far as possible from its first number to its last.", "cells", [2, 4, 6, 8, 10, 12, 14], "the rows' climb"),
      more("start", "the first column's total", "The rows should start as high as possible (the first column's total).", "cells", [4, 6, 8, 10, 12, 14], "the first column"),
      primesTie([4, 5, 6, 7, 8, 9, 10]),
    ],
  };
  return family<None>("steady-steps", "Steady Steps", ["steps", "cells"], shape, [{}], ctx => {
    const bs = rows(n).map((_, r) => ref("steps", `bend${r}`));
    const bends = bs.map(r => readNum(ctx, r));
    ctx.term("steady", "how far each row's steps are from equal, added up", q(bends.reduce((t, x) => t + x, 0)), bs);
    bs.forEach((r, i) => ctx.mark(bends[i] === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: `uneven by ${bends[i]}` }));
    const cells = readCells(ctx, n);
    const ends = rows(n).flatMap((_, r) => [at(n, r, 0), at(n, r, n - 1)]);
    ctx.term("climb", "how far the rows climb, added up", q(rows(n).reduce((t, _, r) => t + Math.abs(cells.v[at(n, r, n - 1)]! - cells.v[at(n, r, 0)]!), 0)), ends.map(i => cells.refs[i]!));
    totalOf(ctx, "start", "the first column's total", cells, rows(n).map((_, r) => at(n, r, 0)));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
  }, n);
}

// ---------------------------------------------------------------- 5. Box Totals

export function boxTotals(n: number): RuleFamily<GridState, T> {
  const shape: Shape<T> = {
    main: distance<T>("boxes", "every corner box adds up to the target", p => `Each corner box of four cells should add up to ${p.T}.`, "boxes", [16, 12, 8, 6, 4, 3, 2, 1, 0], "the boxes' totals"),
    tieBreakers: [
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells", [12, 16, 20, 22, 24, 26], "the corners"),
      primesTie([5, 6, 8, 10, 11, 12]), zerosTie([1, 2, 3, 4, 5, 6]),
    ],
  };
  return family<T>("box-totals", "Box Totals", ["boxes", "cells"], shape, [{ T: 12 }], (ctx, p) => {
    const bs = boxes(n).map((_, k) => ref("boxes", `box${k}`));
    const totals = bs.map(r => readNum(ctx, r));
    ctx.term("boxes", `how far the boxes' totals are from ${p.T}, added up`, q(totals.reduce((t, x) => t + Math.abs(x - p.T), 0)), bs);
    bs.forEach((r, i) => { const d = totals[i]! - p.T; ctx.mark(d === 0 ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: d < 0 ? `${-d} short` : `${d} over` }); });
    const cells = readCells(ctx, n);
    totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 6. Prime Cells

export function primeCells(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("prime-count", "prime numbers on the board", "As many cells as possible should hold a prime number (2, 3, 5 or 7).", "cells", [4, 6, 7, 8, 9, 10, 11, 12, 13], "prime numbers", "count"),
    tieBreakers: [
      more("prime-total", "the primes' total", "Those primes should add up to as much as possible.", "cells", [35, 40, 45, 50, 55, 60, 65], "the primes' total"),
      more("sevens", "7s on the board", "As many cells as possible should hold a 7.", "cells", [1, 2, 3, 4, 5, 6], "7s", "count"),
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells", [8, 12, 16, 20, 22, 24], "the corners"),
    ],
  };
  return family<None>("prime-cells", "Prime Cells", ["cells"], shape, [{}], ctx => {
    const cells = readCells(ctx, n);
    countCells(ctx, "prime-count", "prime numbers on the board", cells, isPrimeCell, true);
    ctx.term("prime-total", "the primes' total", q(cells.v.reduce((t, x) => t + (isPrimeCell(x) ? x : 0), 0)), cells.refs);
    countCells(ctx, "sevens", "7s on the board", cells, x => x === 7, false);
    totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
  }, n);
}

export const gridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [rowTotals(n), oppositePairs(n), mirrorRows(n), steadySteps(n), boxTotals(n), primeCells(n)];

