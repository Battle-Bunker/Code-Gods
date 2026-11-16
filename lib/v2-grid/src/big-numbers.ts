/**
 * "Grids · big numbers" (docs/engine-v2/grid-tuple-rules/): rules in the owner's tuple shape (design-principles.md
 * principle 3b) for a board whose cells hold any whole number. Undealt: no preset or gallery list holds them yet; the
 * coordinator reads the walk-through first.
 *
 * Both families read a total, find the prime ending in k nearest it (bigger is better), then how close the total is,
 * then a third part of the board against the same prime. On a board of uncapped cells a big total costs its path, so
 * the main part has no top (a 4×4 board of digits cannot carry this shape: grid-tuple-rules/README.md).
 *
 * - Prime Biggest Four reads the four biggest numbers wherever they sit: rearranging the board (a swap, a rotation, a
 *   turn) never changes its first two parts, so a cheap knock must take from a big number, and repairing that costs more.
 * - Prime Rows reads one edge line, so where the numbers sit matters: its defence against rearrangement is a lock.
 */
import { isPrimeB, q, ref, type ElementRef, type RuleFamily } from "@workspace/v2-core";
import { type GridState } from "./grid.ts";
import { family, readCells, type Ctx, type L, type Shape } from "./family-kit.ts";

/** The prime ending in `ends` (1, 3, 7 or 9) nearest x ≥ 0; halfway between two, the smaller (as the line families). */
export function nearestPrimeEnding(x: number, ends: number): number {
  const ok = (n: number) => n >= 2 && n % 10 === ends && isPrimeB(BigInt(n));
  for (let d = 0; ; d++) {
    if (ok(x - d)) return x - d;
    if (ok(x + d)) return x + d;
  }
}
/** How far t is from the nearest positive multiple of p. */
export const toPositiveMultiple = (t: number, p: number): number => (t <= p ? p - t : Math.min(t % p, p - (t % p)));

const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);
const rowOf = (n: number, r: number) => Array.from({ length: n }, (_, c) => r * n + c);
const colOf = (n: number, c: number) => Array.from({ length: n }, (_, r) => r * n + c);
/** The cell holding the biggest number among `cells` (the first in reading order on a tie). */
const biggest = (v: readonly number[], cells: readonly number[]) => cells.reduce((b, i) => (v[i]! > v[b]! ? i : b), cells[0]!);

// ---------------------------------------------------------------- the score, as plain numbers (shared with the starters' tests)

export type BigThird = "row" | "column" | "rest" | "cross" | "opposite";
export interface PrimeScore { readonly total: number; readonly prime: number; readonly off: number; readonly thirds: Readonly<Partial<Record<BigThird, number>>>; readonly cells: readonly number[] }

/** The four biggest numbers' cells (reading order breaks ties) and their total. */
export function biggestFour(v: readonly number[]): number[] {
  return [...v.keys()].sort((a, b) => v[b]! - v[a]! || a - b).slice(0, 4).sort((a, b) => a - b);
}
export function primeBiggestFourScore(v: readonly number[], n: number, ends: number): PrimeScore {
  const cells = biggestFour(v), total = sum(cells.map(i => v[i]!)), prime = nearestPrimeEnding(total, ends);
  const top = biggest(v, [...v.keys()]), r = Math.floor(top / n), c = top % n;
  const rest = sum(v) - total;
  return {
    total, prime, off: Math.abs(total - prime), cells,
    thirds: { row: Math.abs(sum(rowOf(n, r).map(i => v[i]!)) - prime), column: Math.abs(sum(colOf(n, c).map(i => v[i]!)) - prime), rest: toPositiveMultiple(rest, prime) },
  };
}

export type Edge = "top" | "bottom" | "left" | "right";
export const edgeCells = (n: number, e: Edge): number[] => (e === "top" ? rowOf(n, 0) : e === "bottom" ? rowOf(n, n - 1) : e === "left" ? colOf(n, 0) : colOf(n, n - 1));
const OPPOSITE: Record<Edge, Edge> = { top: "bottom", bottom: "top", left: "right", right: "left" };
/** The line across an edge through one of its cells: a column for a row edge, a row for a column edge. */
const crossAt = (n: number, e: Edge, i: number) => (e === "top" || e === "bottom" ? colOf(n, i % n) : rowOf(n, Math.floor(i / n)));

export function primeRowsScore(v: readonly number[], n: number, edge: Edge, ends: number): PrimeScore {
  const cells = edgeCells(n, edge), total = sum(cells.map(i => v[i]!)), prime = nearestPrimeEnding(total, ends);
  const cross = crossAt(n, edge, biggest(v, cells));
  return {
    total, prime, off: Math.abs(total - prime), cells,
    thirds: {
      cross: Math.abs(sum(cross.map(i => v[i]!)) - prime),
      opposite: Math.abs(sum(edgeCells(n, OPPOSITE[edge]).map(i => v[i]!)) - prime),
      rest: toPositiveMultiple(sum(v) - total, prime),
    },
  };
}

// ---------------------------------------------------------------- the families

const PRIMES_ENDING: Record<number, string> = { 1: "11, 31, 41, 61, 71, 101, 131, …", 3: "3, 13, 23, 43, 53, 73, 83, 103, …", 7: "7, 17, 37, 47, 67, 97, 107, …", 9: "19, 29, 59, 79, 89, 109, 139, …" };
const primeWords = (ends: number) => `the prime number ending in ${ends} nearest that total (a prime can be divided only by 1 and itself: ${PRIMES_ENDING[ends]}; halfway between two, take the smaller)`;
const closeLayer = <P,>(): L<P> => ({ id: "closeness", title: "how close the total is to that prime", rep: "cells", sense: "min", sentence: () => "The total should be as close as possible to that prime." });
const restLayer = <P,>(): L<P> => ({ id: "rest", title: "the other twelve numbers' total, how close to a multiple of the prime", rep: "cells", sense: "min",
  sentence: () => "The other twelve numbers should add up to as close as possible to a multiple of that prime (the prime, twice it, three times it, …)." });
const tree = <F extends object>(f: F): F & { valuation: "tree" } => ({ ...f, valuation: "tree" as const });
const ENDS = [1, 3, 7, 9] as const;

type PB4 = { ends: number };
const b4Shape: Shape<PB4> = {
  main: { id: "prime", title: "the prime ending in k nearest the four biggest numbers' total, the bigger the better", rep: "cells", sense: "max",
    sentence: p => `Add up the four biggest numbers on the board, wherever they are. Find ${primeWords(p.ends)}. The bigger that prime, the better.` },
  tieBreakers: [
    closeLayer<PB4>(),
    { id: "row", title: "the biggest number's row total, how close to the prime", rep: "cells", sense: "min",
      sentence: () => "The row holding the biggest number should add up to as close as possible to that prime." },
    { id: "column", title: "the biggest number's column total, how close to the prime", rep: "cells", sense: "min",
      sentence: () => "The column holding the biggest number should add up to as close as possible to that prime." },
    restLayer<PB4>(),
  ],
};

type PR = { edge: Edge; ends: number };
const EDGE_WORDS: Record<Edge, string> = { top: "the top row", bottom: "the bottom row", left: "the left column", right: "the right column" };
const prShape: Shape<PR> = {
  main: { id: "prime", title: "the prime ending in k nearest an edge line's total, the bigger the better", rep: "cells", sense: "max",
    sentence: p => `Add up the four numbers in ${EDGE_WORDS[p.edge]}. Find ${primeWords(p.ends)}. The bigger that prime, the better.` },
  tieBreakers: [
    closeLayer<PR>(),
    { id: "cross", title: "the line across through the edge's biggest number, how close its total is to the prime", rep: "cells", sense: "min",
      sentence: p => `Find the biggest number in ${EDGE_WORDS[p.edge]} and add up the whole ${p.edge === "top" || p.edge === "bottom" ? "column" : "row"} through it: that total should be as close as possible to that prime.` },
    { id: "opposite", title: "the opposite edge's total, how close to the prime", rep: "cells", sense: "min",
      sentence: p => `${EDGE_WORDS[OPPOSITE[p.edge]].replace(/^t/, "T")} should add up to as close as possible to that prime too.` },
    restLayer<PR>(),
  ],
};

/** Record a prime score's terms and marks. */
function record(ctx: Ctx, n: number, s: PrimeScore, thirdCells: Partial<Record<BigThird, readonly number[]>>, label: string): void {
  const { refs } = readCells(ctx, n), at = (cs: readonly number[]): ElementRef[] => cs.map(i => refs[i]!);
  const src = at(s.cells);
  ctx.term("prime", `${label} total ${s.total}: the nearest prime is ${s.prime}`, q(s.prime), src);
  ctx.term("closeness", `${s.off} from ${s.prime}`, q(s.off), src);
  for (const [id, d] of Object.entries(s.thirds)) ctx.term(id, `${d} from ${id === "rest" ? `a multiple of ${s.prime}` : s.prime}`, q(d!), at(thirdCells[id as BigThird] ?? []));
  for (const r of src) ctx.mark({ kind: "focus", ref: r, term: "prime" });
  ctx.mark({ kind: "note", ref: src[0]!, term: "closeness", text: `${label} total ${s.total}; nearest prime ending in ${s.prime % 10}: ${s.prime} (${s.off} away)` });
}

export function primeBiggestFour(n: number): RuleFamily<GridState, PB4> {
  return tree(family<PB4>("prime-biggest-four", "Prime Biggest Four", ["cells"], b4Shape, ENDS.map(ends => ({ ends })), (ctx, p) => {
    const { v } = readCells(ctx, n), s = primeBiggestFourScore(v, n, p.ends);
    const top = biggest(v, [...v.keys()]);
    const restCells = [...v.keys()].filter(i => !s.cells.includes(i));
    record(ctx, n, s, { row: rowOf(n, Math.floor(top / n)), column: colOf(n, top % n), rest: restCells }, "the four biggest numbers'");
  }, n));
}

/** Dealt: each edge with each ending (16); the edges are the board's symmetries, the endings near-equal. */
export const PRIME_ROWS_DEALT: readonly PR[] = (["top", "bottom", "left", "right"] as const).flatMap(edge => ENDS.map(ends => ({ edge, ends })));
export function primeRows(n: number): RuleFamily<GridState, PR> {
  return tree(family<PR>("prime-rows", "Prime Rows", ["cells"], prShape, [...PRIME_ROWS_DEALT], (ctx, p) => {
    const { v } = readCells(ctx, n), s = primeRowsScore(v, n, p.edge, p.ends);
    const cells = edgeCells(n, p.edge);
    record(ctx, n, s, { cross: crossAt(n, p.edge, biggest(v, cells)), opposite: edgeCells(n, OPPOSITE[p.edge]), rest: [...v.keys()].filter(i => !cells.includes(i)) }, EDGE_WORDS[p.edge] + "'s");
  }, n));
}

export const bigNumberFamilies = (n: number) => [primeBiggestFour(n), primeRows(n)];
