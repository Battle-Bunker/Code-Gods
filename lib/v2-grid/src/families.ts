/**
 * The grid's rule families (docs/engine-v2/grids.md §6). The beginner pool is the old beginner grid's eight rules
 * (archive/engine-v1, docs/beginner-pool.md), regraded: each a main layer in one representation and in a 12-year-old's
 * words, and three alternative tie-breakers; a dealt rule is the main layer plus one (owner decision 14); every layer
 * graded (decision 13). Steady Steps, Box Totals and Prime Cells are a second pool. A family whose layers add up over
 * disjoint units declares them (sums.ts) and is valued exactly; the others are sampled (owner decision 22).
 */
import { q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { at, cellName, type GridState } from "./grid.ts";
import { boxEdges, boxes, corners, folds, leaps, pairs, rows, windows } from "./units.ts";

type Ctx = EvalContext<GridState>;
type L<P> = Layer<P>;

function distance<P>(id: string, title: string, sentence: (p: P) => string, rep: string): L<P> {
  return { id, title, sentence, rep, sense: "min" };
}
function more<P>(id: string, title: string, sentence: string, rep: string | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max" };
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
const primesTie = <P,>(): L<P> => more("primes", "prime numbers on the board", "As many cells as possible should hold a prime number (2, 3, 5 or 7).", "cells");
const zerosTie = <P,>(): L<P> => more("zeros", "0s on the board", "As many cells as possible should hold 0.", "cells");

// ---------------------------------------------------------------- shared readers

/** Read a list of derived elements of one representation (row totals, pair totals, gaps …) as numbers. */
function readAll(ctx: Ctx, rep: string, names: readonly string[]): { refs: ElementRef[]; v: number[] } {
  const refs = names.map(nm => ref(rep, nm));
  return { refs, v: refs.map(r => readNum(ctx, r)) };
}
const sumOf = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);
/** Notes on each unit: a focus where it is perfect, else a short word. */
function noteEach(ctx: Ctx, units: { refs: ElementRef[]; v: number[] }, perfect: (x: number) => boolean, word: (x: number) => string): void {
  units.refs.forEach((r, i) => ctx.mark(perfect(units.v[i]!) ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: word(units.v[i]!) }));
}

type T = { T: number };
type None = Record<string, never>;

// ---------------------------------------------------------------- 1. Mirrormancer

export function mirrormancer(n: number): RuleFamily<GridState, None> {
  const middle = rows(n).flatMap((_, r) => Array.from({ length: n - 2 }, (_, j) => at(n, r, j + 1)));
  const shape: Shape<None> = {
    main: distance<None>("mirror", "every row reads the same backwards", () => "Every row should read the same backwards, like 3 1 1 3.", "mirror"),
    tieBreakers: [
      more("middle", "the middle columns' total", "The middle two columns should add up to as much as possible.", "cells"),
      primesTie(),
      zerosTie(),
    ],
  };
  return family<None>("mirrormancer", "Mirrormancer", ["mirror", "cells"], shape, [{}], ctx => {
    const gaps = readAll(ctx, "mirror", rows(n).map((_, r) => `gap${r}`));
    ctx.term("mirror", "how far the rows are from reading the same backwards, added up", q(sumOf(gaps.v)), gaps.refs);
    noteEach(ctx, gaps, x => x === 0, x => `off by ${x}`);
    const cells = readCells(ctx, n);
    totalOf(ctx, "middle", "the middle columns' total", cells, middle);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 2. Magic Eighteen

export function magicEighteen(n: number): RuleFamily<GridState, T> {
  const shape: Shape<T> = {
    main: distance<T>("rows", "every row adds up to the target", p => `Every row should add up to ${p.T}.`, "tally"),
    tieBreakers: [
      more("first-column", "the first column's total", "The first column should add up to as much as possible.", "cells"),
      primesTie(),
      more("odd", "odd numbers on the board", "As many cells as possible should hold an odd number.", "cells"),
    ],
  };
  return family<T>("magic-eighteen", "Magic Eighteen", ["tally", "cells"], shape, [{ T: 18 }], (ctx, p) => {
    const totals = readAll(ctx, "tally", rows(n).map((_, r) => `row${r}`));
    ctx.term("rows", `how far the rows' totals are from ${p.T}, added up`, q(sumOf(totals.v.map(x => Math.abs(x - p.T)))), totals.refs);
    noteEach(ctx, totals, x => x === p.T, x => (x < p.T ? `${p.T - x} short` : `${x - p.T} over`));
    const cells = readCells(ctx, n);
    totalOf(ctx, "first-column", "the first column's total", cells, rows(n).map((_, r) => at(n, r, 0)));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "odd", "odd numbers on the board", cells, x => x % 2 === 1, false);
  }, n);
}

// ---------------------------------------------------------------- 3. Opposite Nines

export function oppositeNines(n: number): RuleFamily<GridState, T> {
  const ps = pairs(n);
  const shape: Shape<T> = {
    main: distance<T>("pairs", "every cell and its opposite add up to the target",
      p => `Every cell and its opposite (where a half turn of the board takes it) should add up to ${p.T}.`, "turn"),
    tieBreakers: [
      more("top-half", "the top half's total", "The top half of the board should add up to as much as possible.", "cells"),
      primesTie(),
      more("odd", "odd numbers on the board", "As many cells as possible should hold an odd number.", "cells"),
    ],
  };
  return family<T>("opposite-nines", "Opposite Nines", ["turn", "cells"], shape, [{ T: 9 }], (ctx, p) => {
    const totals = readAll(ctx, "turn", ps.map((_, k) => `pair${k}`));
    ctx.term("pairs", `how far each pair's total is from ${p.T}, added up`, q(sumOf(totals.v.map(x => Math.abs(x - p.T)))), totals.refs);
    noteEach(ctx, totals, x => x === p.T, x => `${x}`);
    const cells = readCells(ctx, n);
    totalOf(ctx, "top-half", "the top half's total", cells, ps.map(([a]) => a));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "odd", "odd numbers on the board", cells, x => x % 2 === 1, false);
  }, n);
}

// ---------------------------------------------------------------- 4. Two Pair

export function twoPair(n: number): RuleFamily<GridState, None> {
  const bx = boxes(n);
  const shape: Shape<None> = {
    main: distance<None>("two-pair", "every corner box holds two different pairs",
      () => "Each corner box of four cells should hold two different pairs, like 3 3 8 8 in any order.", "boxes"),
    tieBreakers: [
      more("apart", "how far apart each box's pairs are", "In each box the two pairs should be as far apart as possible (biggest minus smallest, added up).", "cells"),
      primesTie(),
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells"),
    ],
  };
  return family<None>("two-pair", "Two Pair", ["boxes", "cells"], shape, [{}], ctx => {
    const gaps = readAll(ctx, "boxes", bx.map((_, k) => `pairs${k}`));
    ctx.term("two-pair", "how far the boxes are from two different pairs, added up", q(sumOf(gaps.v)), gaps.refs);
    noteEach(ctx, gaps, x => x === 0, x => `off by ${x}`);
    const cells = readCells(ctx, n);
    const apart = sumOf(bx.map(cs => { const v = cs.map(i => cells.v[i]!); return Math.max(...v) - Math.min(...v); }));
    ctx.term("apart", "biggest minus smallest in each box, added up", q(apart), cells.refs);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
  }, n);
}

// ---------------------------------------------------------------- 5. Spread of Three (overlapping windows: sampled)

export function spreadOfThree(n: number): RuleFamily<GridState, None> {
  const ws = windows(n);
  const shape: Shape<None> = {
    main: distance<None>("spread", "every 2×2 square spreads by 3",
      () => "Every 2×2 square should have a spread of exactly 3: its biggest number 3 more than its smallest. The squares overlap.", "windows"),
    tieBreakers: [
      primesTie(),
      zerosTie(),
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells"),
    ],
  };
  return family<None>("spread-of-three", "Spread of Three", ["windows", "cells"], shape, [{}], ctx => {
    const sp = readAll(ctx, "windows", ws.map((_, k) => `w${k}`));
    ctx.term("spread", "how far each square's spread is from 3, added up", q(sumOf(sp.v.map(x => Math.abs(x - 3)))), sp.refs);
    noteEach(ctx, sp, x => x === 3, x => `spread ${x}`);
    const cells = readCells(ctx, n);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
    totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
  }, n);
}

// ---------------------------------------------------------------- 6. Strangers

export function strangersFamily(n: number): RuleFamily<GridState, None> {
  const bx = boxes(n);
  const shape: Shape<None> = {
    main: more<None>("strangers", "touching strangers in the corner boxes",
      "Touching numbers in the same corner box should be strangers: both bigger than 1, no common divisor bigger than 1, and at least 2 apart (like 2 and 5).", "boxes"),
    tieBreakers: [
      more("ones", "1s beside a bigger number in their box", "As many 1s as possible should touch a number bigger than 1 in their box (count each touch).", "cells"),
      primesTie(),
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells"),
    ],
  };
  return family<None>("strangers", "Strangers", ["boxes", "cells"], shape, [{}], ctx => {
    const st = readAll(ctx, "boxes", bx.map((_, k) => `strangers${k}`));
    ctx.term("strangers", "touching strangers in the boxes", q(sumOf(st.v)), st.refs);
    noteEach(ctx, st, x => x === 4, x => `${x} of 4`);
    const cells = readCells(ctx, n);
    const ones = sumOf(bx.map(cs => boxEdges(cs).filter(([a, b]) => { const x = cells.v[a]!, y = cells.v[b]!; return (x === 1 && y > 1) || (y === 1 && x > 1); }).length));
    ctx.term("ones", "1s touching a bigger number in their box", q(ones), cells.refs);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    totalOf(ctx, "corners", "the four corners' total", cells, corners(n));
  }, n);
}

// ---------------------------------------------------------------- 7. Leapfrog

export function leapfrog(n: number): RuleFamily<GridState, None> {
  const lp = leaps(n);
  const shape: Shape<None> = {
    main: distance<None>("leap", "each number one apart from the number two cells along",
      () => "In every row, each number and the number two cells along (leaping over the one between) should be one apart, like 4 _ 5.", "leaps"),
    tieBreakers: [
      more("first-column", "the first column's total", "The first column should add up to as much as possible.", "cells"),
      primesTie(),
      zerosTie(),
    ],
  };
  return family<None>("leapfrog", "Leapfrog", ["leaps", "cells"], shape, [{}], ctx => {
    const d = readAll(ctx, "leaps", lp.map((_, k) => `leap${k}`));
    ctx.term("leap", "how far each leap is from one apart, added up", q(sumOf(d.v.map(x => Math.abs(Math.abs(x) - 1)))), d.refs);
    noteEach(ctx, d, x => Math.abs(x) === 1, x => `${Math.abs(x)} apart`);
    const cells = readCells(ctx, n);
    totalOf(ctx, "first-column", "the first column's total", cells, rows(n).map((_, r) => at(n, r, 0)));
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 8. Crosswise Threes

export function crosswiseThrees(n: number): RuleFamily<GridState, None> {
  const fp = folds(n);
  const shape: Shape<None> = {
    main: distance<None>("crosswise", "folded cells three apart",
      () => "Fold the board along the diagonal from the top-right corner: each number and the number it lands on should be 3 apart, like 2 and 5.", "fold"),
    tieBreakers: [
      more("fold-line", "the fold line's total", "The cells on the fold line should add up to as much as possible.", "fold"),
      primesTie(),
      zerosTie(),
    ],
  };
  return family<None>("crosswise-threes", "Crosswise Threes", ["fold", "cells"], shape, [{}], ctx => {
    const d = readAll(ctx, "fold", fp.map((_, k) => `fold${k}`));
    ctx.term("crosswise", "how far each folded pair is from 3 apart, added up", q(sumOf(d.v.map(x => Math.abs(Math.abs(x) - 3)))), d.refs);
    noteEach(ctx, d, x => Math.abs(x) === 3, x => `${Math.abs(x)} apart`);
    const line = ref("fold", "line");
    ctx.term("fold-line", "the fold line's total", q(readNum(ctx, line)), [line]);
    const cells = readCells(ctx, n);
    countCells(ctx, "primes", "prime numbers on the board", cells, isPrimeCell, false);
    countCells(ctx, "zeros", "0s on the board", cells, x => x === 0, false);
  }, n);
}

// ---------------------------------------------------------------- 9. Steady Steps (second pool)

export function steadySteps(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: distance<None>("steady", "every row goes up or down in equal steps",
      () => "Along every row the numbers should go up (or down) in equal steps, like 1 3 5 7.", "steps"),
    tieBreakers: [
      more("climb", "how far the rows climb", "Each row should climb (or fall) as far as possible from its first number to its last.", "cells"),
      more("start", "the first column's total", "The rows should start as high as possible (the first column's total).", "cells"),
      primesTie(),
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

// ---------------------------------------------------------------- 10. Box Totals (second pool)

export function boxTotals(n: number): RuleFamily<GridState, T> {
  const shape: Shape<T> = {
    main: distance<T>("boxes", "every corner box adds up to the target", p => `Each corner box of four cells should add up to ${p.T}.`, "boxes"),
    tieBreakers: [
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells"),
      primesTie(), zerosTie(),
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

// ---------------------------------------------------------------- 11. Prime Cells (second pool)

export function primeCells(n: number): RuleFamily<GridState, None> {
  const shape: Shape<None> = {
    main: more<None>("prime-count", "prime numbers on the board", "As many cells as possible should hold a prime number (2, 3, 5 or 7).", "cells"),
    tieBreakers: [
      more("prime-total", "the primes' total", "Those primes should add up to as much as possible.", "cells"),
      more("sevens", "7s on the board", "As many cells as possible should hold a 7.", "cells"),
      more("corners", "the board's four corners", "The board's four corners should add up to as much as possible.", "cells"),
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

/** The beginner pool: the old beginner grid's eight rules, regraded. */
export const beginnerGridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [mirrormancer(n), magicEighteen(n), oppositeNines(n), twoPair(n), spreadOfThree(n), strangersFamily(n), leapfrog(n), crosswiseThrees(n)];

/** Every grid family: the beginner pool, then the second pool. */
export const gridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [...beginnerGridFamilies(n), steadySteps(n), boxTotals(n), primeCells(n)];
