/** The building blocks every grid family is made of (families.ts, more-families.ts): layers, the card, readers and shared tie-breakers. */
import { q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";
import { at, cellName, type GridState } from "./grid.ts";
import { rows } from "./units.ts";

export type Ctx = EvalContext<GridState>;
export type L<P> = Layer<P>;

export function distance<P>(id: string, title: string, sentence: (p: P) => string, rep: string): L<P> {
  return { id, title, sentence, rep, sense: "min" };
}
export function more<P>(id: string, title: string, sentence: string | ((p: P) => string), rep: string | "size" = "size"): L<P> {
  return { id, title, sentence: typeof sentence === "string" ? () => sentence : sentence, rep, sense: "max" };
}

export interface Shape<P> { readonly main: L<P>; readonly tieBreakers: readonly L<P>[] }
function card<P>(f: Shape<P>, p: P, tb: TieBreaker): string {
  const t = tb === null ? undefined : f.tieBreakers.find(x => x.id === tb);
  return t ? `${f.main.sentence(p)} Tie-breaker: ${t.sentence(p)}` : f.main.sentence(p);
}
/** A grid family; `params` lists its dealable parameter sets, or derives them from the variant. */
export function family<P extends object>(id: string, title: string, depends: string[], shape: Shape<P>, params: P[] | ((v: Variant) => P[]), evaluate: (ctx: Ctx, p: P, n: number) => void, n: number): RuleFamily<GridState, P> {
  return { id, title, card: (p, tb) => card(shape, p, tb), params: [], dealable: v => (typeof params === "function" ? params(v) : params), depends, ...shape, evaluate: (ctx, p) => evaluate(ctx, p, n) };
}

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);
export const isPrimeCell = (x: number): boolean => PRIMES.has(x);

/** Read every cell: the board's numbers, and each cell's ref (for terms and marks). */
export function readCells(ctx: Ctx, n: number): { v: number[]; refs: ElementRef[] } {
  const refs = Array.from({ length: n * n }, (_, i) => ref("cells", cellName(n, i)));
  return { v: refs.map(r => Number((ctx.read(r) as { q: Q }).q.n)), refs };
}
export const readNum = (ctx: Ctx, r: ElementRef): number => Number((ctx.read(r) as { q: Q }).q.n);

/** A count over cells (primes, zeros, odd numbers, 7s): records the term and focuses the cells it counts. */
export function countCells(ctx: Ctx, id: string, label: string, cells: { v: number[]; refs: ElementRef[] }, test: (x: number) => boolean, focus: boolean): void {
  const hit = cells.v.flatMap((x, i) => (test(x) ? [i] : []));
  ctx.term(id, label, q(hit.length), cells.refs);
  if (focus) for (const i of hit) ctx.mark({ kind: "focus", ref: cells.refs[i]! });
}
/** A total over some cells (the first column, the corners, the top half). */
export function totalOf(ctx: Ctx, id: string, label: string, cells: { v: number[]; refs: ElementRef[] }, which: readonly number[]): void {
  ctx.term(id, label, q(which.reduce((t, i) => t + cells.v[i]!, 0)), which.map(i => cells.refs[i]!));
}

/** Tie-breakers several families share; each family sets their rungs so that its dealt top is in the band. */
export const primesTie = <P,>(): L<P> => more("primes", "prime numbers on the board", "As many cells as possible should hold a prime number (2, 3, 5 or 7).", "cells");
export const zerosTie = <P,>(): L<P> => more("zeros", "0s on the board", "As many cells as possible should hold 0.", "cells");

/** A count or a distance as one layer's term. */
export const term = (ctx: Ctx, id: string, label: string, x: number, refs: readonly ElementRef[]) => ctx.term(id, label, q(x), [...refs]);
export const sumOf = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);
/** The board's two diagonals: top-left to bottom-right, then top-right to bottom-left. */
export const diagonals = (n: number): number[][] => [rows(n).map((_, k) => at(n, k, k)), rows(n).map((_, k) => at(n, k, n - 1 - k))];
/** How far each group's total is from T, added up. */
export const offTotals = (v: readonly number[], groups: readonly (readonly number[])[], T: number) => sumOf(groups.map(g => Math.abs(sumOf(g.map(i => v[i]!)) - T)));
