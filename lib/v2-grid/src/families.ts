/**
 * The grid's rule families (docs/engine-v2/grids.md §6). The beginner pool is the old beginner grid's eight rules
 * (archive/engine-v1, docs/beginner-pool.md), regraded: each a main layer in one representation and in a 12-year-old's
 * words, and three alternative tie-breakers; a dealt rule is the main layer plus one (owner decision 14); every layer
 * graded (decision 13). Steady Steps, Box Totals and Prime Cells are a second pool. A family whose layers add up over
 * disjoint units declares them (sums.ts) and is valued exactly; the others are sampled (owner decision 22).
 */
import { q, ref, type ElementRef, type RuleFamily } from "@workspace/v2-core";
import { at, type GridState } from "./grid.ts";
import { countCells, diagonals, distance, family, offTotals, sumOf, term, isPrimeCell, more, primesTie, readCells, readNum, totalOf, zerosTie, type Ctx, type Shape } from "./family-kit.ts";
import { moreGridFamilies } from "./more-families.ts";
import { paramGridFamilies } from "./param-families.ts";
import { divisibility } from "./divisibility.ts";
import { leadingDigits } from "./leading-digits.ts";
import { roundNumbers } from "./v1-round-numbers.ts";
import { numberBonds } from "./v1-number-bonds.ts";
import { columnAddition } from "./v1-column-addition.ts";
import { boxEdges, boxes, cols, corners, folds, gcd, leaps, pairs, rows, strangers, windows } from "./units.ts";

export { isPrimeCell };

// ---------------------------------------------------------------- shared readers

/** Read a list of derived elements of one representation (row totals, pair totals, gaps …) as numbers. */
function readAll(ctx: Ctx, rep: string, names: readonly string[]): { refs: ElementRef[]; v: number[] } {
  const refs = names.map(nm => ref(rep, nm));
  return { refs, v: refs.map(r => readNum(ctx, r)) };
}
/** Notes on each unit: a focus where it is perfect, else a short word. */
function noteEach(ctx: Ctx, units: { refs: ElementRef[]; v: number[] }, perfect: (x: number) => boolean, word: (x: number) => string): void {
  units.refs.forEach((r, i) => ctx.mark(perfect(units.v[i]!) ? { kind: "focus", ref: r } : { kind: "note", ref: r, text: word(units.v[i]!) }));
}

/** Numbers that share a factor bigger than 1 (0 shares every factor of the other number; 0 and 0, or a 1, share none). */
const shareFactor = (a: number, b: number) => gcd(a, b) > 1;
/** The diagonals of an n×n board: top-left to bottom-right, then top-right to bottom-left. */
/** How far some groups' totals are from T, added up. */
/** A count over all cells, as a term. */

type T = { T: number };
/** Two ways to split T, for the card ("0 and 9, 4 and 5" for 9). */
const splitExample = (T: number) => `0 and ${T}, ${Math.floor(T / 2)} and ${T - Math.floor(T / 2)}`;
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
      distance<None>("mirror-columns", "every column reads the same backwards", () => "Every column should read the same backwards too.", "cells"),
      distance<None>("one-apart", "each end number one apart from the number beside it",
        () => "In each row, each end number and the number beside it should be one apart, like 4 5 5 4.", "cells"),
      distance<None>("small-middle", "the rows' middle numbers", () => "Each row's middle pair should be as small as possible.", "cells"),
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
    const v = cells.v, back = (l: readonly number[]) => sumOf(l.slice(0, Math.floor(n / 2)).map((i, k) => Math.abs(v[i]! - v[l[n - 1 - k]!]!)));
    term(ctx, "mirror-columns", "how far the columns are from reading the same backwards, added up", sumOf(cols(n).map(back)), cells.refs);
    const ends = rows(n).flatMap(l => [[l[0]!, l[1]!], [l[n - 2]!, l[n - 1]!]]);
    term(ctx, "one-apart", "how far each end number is from one apart from the number beside it, added up", sumOf(ends.map(([a, b]) => Math.abs(Math.abs(v[a]! - v[b]!) - 1))), cells.refs);
    term(ctx, "small-middle", "the middle numbers' total", sumOf(middle.map(i => v[i]!)), middle.map(i => cells.refs[i]!));
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
      distance<T>("columns", "every column adds up to the target too", p => `The columns should add up to ${p.T} too.`, "tally"),
      distance<T>("diagonals", "both diagonals add up to the target too", p => `Both diagonals should add up to ${p.T} too.`, "cells"),
      more("different-numbers", "rows of all different numbers", "Each row should hold four different numbers.", "cells"),
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
    const colTotals = readAll(ctx, "tally", cols(n).map((_, c) => `col${c}`));
    term(ctx, "columns", `how far the columns' totals are from ${p.T}, added up`, sumOf(colTotals.v.map(x => Math.abs(x - p.T))), colTotals.refs);
    term(ctx, "diagonals", `how far the diagonals' totals are from ${p.T}, added up`, offTotals(cells.v, diagonals(n), p.T), diagonals(n).flat().map(i => cells.refs[i]!));
    term(ctx, "different-numbers", "rows of all different numbers", rows(n).filter(l => new Set(l.map(i => cells.v[i])).size === n).length, cells.refs);
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
      distance<T>("mirror-nines", "each number and its mirror in the row add up to the target",
        p => `Each number and the number mirrored across the middle of its row should add up to ${p.T} too.`, "cells"),
      more<T>("different-splits", "different ways the pairs split the target",
        p => `The pairs that add up to ${p.T} should split it in as many different ways as possible, like ${splitExample(p.T)}.`, "cells"),
      more("big-on-top", "pairs with the bigger number in the top half", "In each pair, the bigger number should be in the top half.", "cells"),
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
    const v = cells.v;
    const mirrored = rows(n).flatMap(l => l.slice(0, Math.floor(n / 2)).map((i, k) => [i, l[n - 1 - k]!] as const));
    term(ctx, "mirror-nines", `how far each number and its mirror in the row are from ${p.T}, added up`, sumOf(mirrored.map(([a, b]) => Math.abs(v[a]! + v[b]! - p.T))), cells.refs);
    const splits = new Set(ps.filter(([a, b]) => v[a]! + v[b]! === p.T).map(([a, b]) => Math.min(v[a]!, v[b]!)));
    term(ctx, "different-splits", `different ways the pairs split ${p.T}`, splits.size, cells.refs);
    term(ctx, "big-on-top", "pairs with the bigger number in the top half", ps.filter(([a, b]) => v[a]! > v[b]!).length, cells.refs);
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
      more("diagonal-pairs", "boxes with each pair on a diagonal", "In each corner box, each pair should sit on a diagonal of the box, like 3 8 over 8 3.", "cells"),
      distance<None>("small-pairs", "the smaller pair in each box", () => "The smaller pair in each corner box should be as small as possible.", "cells"),
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
    const v = cells.v;
    term(ctx, "diagonal-pairs", "boxes with each pair on a diagonal", bx.filter(([a, b, c, d]) => v[a!] === v[d!] && v[b!] === v[c!] && v[a!] !== v[b!]).length, cells.refs);
    term(ctx, "small-pairs", "the smallest number in each box, added up", sumOf(bx.map(cs => Math.min(...cs.map(i => v[i]!)))), cells.refs);
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
      more("spread-diagonal", "squares with their biggest and smallest on a diagonal",
        "In as many 2×2 squares as possible, the biggest and the smallest number should sit diagonally.", "cells"),
      distance<None>("spread-small", "each square's smallest number", () => "The smallest number in each 2×2 square should be as small as possible.", "cells"),
      more("square-different", "squares of four different numbers", "As many 2×2 squares as possible should hold four different numbers.", "cells"),
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
    const vs = ws.map(w => w.map(i => cells.v[i]!));   // each square: top-left, top-right, bottom-left, bottom-right
    const diagonal = (x: number[]) => {
      const hi = Math.max(...x), lo = Math.min(...x), h = x.indexOf(hi), l = x.indexOf(lo);
      return x.filter(y => y === hi).length === 1 && x.filter(y => y === lo).length === 1 && h + l === 3;
    };
    term(ctx, "spread-diagonal", "squares with their biggest and smallest on a diagonal", vs.filter(diagonal).length, sp.refs);
    term(ctx, "spread-small", "the squares' smallest numbers, added up", sumOf(vs.map(x => Math.min(...x))), sp.refs);
    term(ctx, "square-different", "squares of four different numbers", vs.filter(x => new Set(x).size === 4).length, sp.refs);
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
      more("prime-strangers", "strangers that are both prime", "As many strangers as possible should both be prime numbers, like 3 and 7.", "cells"),
      more("across-strangers", "strangers across the corner boxes' borders", "Touching numbers in different corner boxes should be strangers too.", "cells"),
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
    const v = cells.v, isStranger = ([a, b]: readonly [number, number]) => strangers(v[a]!, v[b]!);
    term(ctx, "prime-strangers", "strangers that are both prime", bx.flatMap(boxEdges).filter(e => isStranger(e) && isPrimeCell(v[e[0]]!) && isPrimeCell(v[e[1]]!)).length, cells.refs);
    const boxOf = (i: number) => bx.findIndex(cs => cs.includes(i));
    const across = cells.v.flatMap((_, i) => [i + 1, i + n].filter(j => j < n * n && (j === i + n || j % n > 0) && boxOf(j) !== boxOf(i)).map(j => [i, j] as [number, number]));
    term(ctx, "across-strangers", "strangers across the corner boxes' borders", across.filter(isStranger).length, cells.refs);
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
      more("same-way", "rows whose leaps all go the same way", "In each row, both leaps should go the same way: both up or both down.", "cells"),
      distance<None>("columns-leap", "down the columns: each number one apart from the number two cells below",
        () => "Each number and the number two cells down its column should be one apart too.", "cells"),
      more("middle-factors", "numbers between leap partners sharing a factor with both",
        "Each number between two leap partners should share a factor with both, like 6 between 4 and 9.", "cells"),
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
    const v = cells.v;
    // A row counts when it has leaps and every one goes the same way (none flat).
    const sameWay = rows(n).filter(l => { const s = l.slice(0, -2).map((i, k) => Math.sign(v[l[k + 2]!]! - v[i]!)); return s.length > 0 && s[0] !== 0 && s.every(x => x === s[0]); });
    term(ctx, "same-way", "rows whose leaps all go the same way", sameWay.length, cells.refs);
    const down = cols(n).flatMap(l => l.slice(0, -2).map((i, k) => [i, l[k + 2]!] as const));
    term(ctx, "columns-leap", "how far each number is from one apart from the number two cells down, added up", sumOf(down.map(([a, b]) => Math.abs(Math.abs(v[a]! - v[b]!) - 1))), cells.refs);
    const between = rows(n).flatMap(l => l.slice(0, -2).map((i, k) => [i, l[k + 1]!, l[k + 2]!] as const));
    term(ctx, "middle-factors", "numbers between leap partners sharing a factor with both", between.filter(([a, m, b]) => shareFactor(v[m]!, v[a]!) && shareFactor(v[m]!, v[b]!)).length, cells.refs);
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
      more("bigger-side", "folded pairs with the bigger number on the top-left side", "In each fold pair, the bigger number should be on the top-left side of the fold.", "cells"),
      distance<None>("other-fold", "cells folded on the other diagonal three apart",
        () => "Fold the board on its other diagonal too: those numbers should be 3 apart as well.", "cells"),
      more("fold-factors", "folded pairs sharing a factor", "As many fold pairs as possible should share a factor, like 3 and 6.", "cells"),
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
    const v = cells.v;
    term(ctx, "bigger-side", "folded pairs with the bigger number on the top-left side", fp.filter(([a, b]) => v[a]! > v[b]!).length, cells.refs);
    const other = rows(n).flatMap((_, r) => rows(n).map((_, c) => [at(n, r, c), at(n, c, r)] as const).filter((_, c) => r < c));
    term(ctx, "other-fold", "how far each pair folded on the other diagonal is from 3 apart, added up", sumOf(other.map(([a, b]) => Math.abs(Math.abs(v[a]! - v[b]!) - 3))), cells.refs);
    term(ctx, "fold-factors", "folded pairs sharing a factor", fp.filter(([a, b]) => shareFactor(v[a]!, v[b]!)).length, cells.refs);
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

/** Every grid family: the beginner pool, the second pool, the parameterised trials (param-families.ts, in no preset yet), then the coupled rules (more-families.ts). */
export const gridFamilies = (n: number): readonly RuleFamily<GridState, any>[] =>
  [...beginnerGridFamilies(n), steadySteps(n), boxTotals(n), primeCells(n), ...paramGridFamilies(n), divisibility(n), leadingDigits(n), roundNumbers(n), numberBonds(n), ...(n >= 3 ? [columnAddition(n)] : []), ...moreGridFamilies(n)];   // a written sum needs three rows
