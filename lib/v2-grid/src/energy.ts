/**
 * The dynamic energy measure on grids (the owner, 16 Nov; docs/engine-v2/energy.md, "Grids"): "grids don't have
 * variations in size but I think our scoring system naturally works with that simpler scenario by measuring the
 * expected heuristic energy cost of reaching a given utility or higher from a globally random state."
 *
 *   energy(s) = mean over K random boards x of min(direct(x → s), floor(x), heuristics(x))
 *
 * - Start: a board from the walk's law (each cell independent, chance ∝ 2^−step·x). Fresh randomness each time.
 * - direct (the ceiling): rewrite x into s one cell at a time.
 * - floor (shared by every rule): each single move of the variant (every rearrangement, and every amount move by ±1 or
 *   ±2) that reaches u ≥ u(s).
 * - heuristics: for a rule that is a sum over groups of cells (GridParts), the cheapest way to reach u ≥ u(s) by
 *   rewriting whole groups onto the rule's anchors (or onto s's own group, or leaving the group): the cheapest per
 *   group, combined exactly (a Pareto front of cost and utility per group, merged). A rule's own searches propose
 *   whole boards, reached by rewriting the cells that differ.
 * - Price: each move as its own act at the game's act charge (v2-economy changeCharge of the call's bits), as on
 *   lines. Rewriting a cell by k takes the cheapest split of k into single acts.
 * Nothing is computed at import time; tables are built per variant and per rule on first use.
 */
import { rng as makeRng, whichBits, type Estimate, type EstimateOpts, type Mutator, type Rng, type Variant } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { cellName, gridParams, inDomain, type GridState } from "./grid.ts";
import type { GridDynamicRule } from "./dynamic-families.ts";
import { gridMutators } from "./mutators.ts";

/** K on the server: the starts a commit's estimate averages (energy.md: the cost gate). */
export const GRID_K = 8;

/** A random board from the walk's law. */
export function lawBoard(v: Variant, r: Rng): GridState {
  const { size, cap, step } = gridParams(v), w = Array.from({ length: cap + 1 }, (_, x) => 2 ** (-step * x)), z = w.reduce((a, b) => a + b, 0);
  const cell = () => { let u = r.unit() * z; for (let x = 0; x <= cap; x++) { u -= w[x]!; if (u <= 0) return x; } return cap; };
  return { cells: Array.from({ length: size * size }, cell) };
}

// ------------------------------------------------------------------ prices (per variant, on first use)

interface Prices {
  /** cell[cap + k]: the cheapest rewrite of one cell by k, in single acts. */
  readonly cell: readonly number[];
  readonly cap: number;
  /** The floor's single moves, each with its price. */
  readonly moves: readonly { readonly m: Mutator<GridState, any>; readonly args: unknown; readonly price: number }[];
}
const PRICES = new Map<string, Prices>();
/** The moves a grid variant offers. */
const mutatorsOf = (v: Variant): readonly Mutator<GridState, any>[] => gridMutators(gridParams(v).size).filter(m => v.mutators.includes(m.id));

const priceOf = (v: Variant, m: Mutator<GridState, any>, args: unknown): number => {
  const bits = whichBits(v, m.id) + m.args(v).bits(args as never);
  return Number.isFinite(bits) ? changeCharge([bits]) : Infinity;
};
function prices(v: Variant): Prices {
  let p = PRICES.get(v.id);
  if (p) return p;
  const { cap, size } = gridParams(v), ms = mutatorsOf(v), add = ms.find(m => m.id === "cells.add");
  const one = (k: number) => (add ? priceOf(v, add, { cell: cellName(size, 0), k }) : Infinity);
  const best = Array<number>(cap + 1).fill(Infinity);
  best[0] = 0;
  for (let k = 1; k <= cap; k++) { best[k] = one(k); for (let j = 1; j < k; j++) best[k] = Math.min(best[k]!, best[j]! + best[k - j]!); }
  // Down and up cost the same (the call's price has no direction); a surcharge, if any, is the act's, not the estimate's.
  const cell = Array.from({ length: 2 * cap + 1 }, (_, i) => best[Math.abs(i - cap)]!);
  const moves = ms.flatMap(m => {
    const code = m.args(v);
    return [...(code.enumerate?.(16) ?? [])].filter(a => { const k = (a as { k?: number }).k; return k === undefined || Math.abs(k) <= 2; })
      .map(args => ({ m, args, price: priceOf(v, m, args) })).filter(x => Number.isFinite(x.price));
  });
  PRICES.set(v.id, p = { cell, cap, moves });
  return p;
}
/** The price of rewriting x into t one cell at a time. */
export function rewritePrice(x: readonly number[], t: readonly number[], v: Variant): number {
  const { cell, cap } = prices(v);
  let total = 0;
  for (let i = 0; i < t.length; i++) total += cell[cap + t[i]! - x[i]!]!;
  return total;
}

// ------------------------------------------------------------------ the separable heuristic

interface Option { readonly c: number; readonly u: number }
/** The Pareto front: cheapest first, each strictly better than every cheaper one. */
function front(opts: Option[]): Option[] {
  opts.sort((a, b) => a.c - b.c || b.u - a.u);
  const out: Option[] = [];
  for (const o of opts) if (!out.length || o.u > out[out.length - 1]!.u + 1e-12) out.push(o);
  return out;
}
interface Anchored { readonly groups: readonly (readonly number[])[]; readonly anchors: readonly { readonly ds: readonly number[]; readonly u: number }[][] }
const ANCHORS = new WeakMap<object, Map<string, Anchored>>();
function anchored<P>(rule: GridDynamicRule<P>, params: P, n: number): Anchored {
  let byParams = ANCHORS.get(rule.parts!);
  if (!byParams) ANCHORS.set(rule.parts!, byParams = new Map());
  const key = `${n}:${JSON.stringify(params)}`;
  let a = byParams.get(key);
  if (!a) {
    if (byParams.size > 32) byParams.clear();
    const parts = rule.parts!, groups = parts.groups(n, params);
    const byLen = new Map<number, { ds: readonly number[]; u: number }[]>();
    const anchors = groups.map(g => {
      if (!byLen.has(g.length)) byLen.set(g.length, parts.anchors(g.length, params).map(ds => ({ ds, u: parts.part(ds, params) })));
      return byLen.get(g.length)!;
    });
    byParams.set(key, a = { groups, anchors });
  }
  return a;
}
/** The cheapest rewrite of whole groups (onto anchors, onto s's group, or left alone) reaching Σ parts ≥ uStar. */
function separable<P>(rule: GridDynamicRule<P>, params: P, x: readonly number[], s: readonly number[], uStar: number, v: Variant): number {
  const { cell, cap } = prices(v), n = Math.round(Math.sqrt(x.length)), { groups, anchors } = anchored(rule, params, n), part = rule.parts!.part;
  let acc: Option[] = [{ c: 0, u: 0 }];
  groups.forEach((g, gi) => {
    const xs = g.map(i => x[i]!), ss = g.map(i => s[i]!), cost = (ds: readonly number[]) => { let t = 0; for (let k = 0; k < ds.length; k++) t += cell[cap + ds[k]! - xs[k]!]!; return t; };
    const opts: Option[] = [{ c: 0, u: part(xs, params) }, { c: cost(ss), u: part(ss, params) }];
    for (const a of anchors[gi]!) opts.push({ c: cost(a.ds), u: a.u });
    const f = front(opts), next: Option[] = [];
    for (const a of acc) for (const b of f) next.push({ c: a.c + b.c, u: a.u + b.u });
    acc = front(next);
  });
  for (const o of acc) if (o.u >= uStar - 1e-9) return o.c;
  return Infinity;
}

// ------------------------------------------------------------------ the estimate

export interface GridSample { readonly direct: number; readonly floor: number; readonly heuristic: number; readonly cost: number }
export interface GridEstimate extends Estimate { readonly samples: readonly GridSample[] }
let fresh = 0;
/** energy(s) under a grid rule on a variant: the mean over K law boards of min(direct, floor, heuristics). */
export function estimateGrid<P>(s: GridState, rule: GridDynamicRule<P>, params: P, v: Variant, o: EstimateOpts = {}): GridEstimate {
  const K = o.K ?? GRID_K, r = makeRng("grid-energy", o.seed ?? `fresh:${Date.now()}:${fresh++}:${Math.random()}`);
  const u = (cells: readonly number[]) => { const x = rule.u({ cells }, params); return Number.isNaN(x) ? -Infinity : x; };
  const uStar = u(s.cells), P = prices(v), samples: GridSample[] = [];
  for (let k = 0; k < K; k++) {
    const x = lawBoard(v, r);
    if (u(x.cells) >= uStar - 1e-9) { samples.push({ direct: 0, floor: 0, heuristic: 0, cost: 0 }); continue; }
    const direct = rewritePrice(x.cells, s.cells, v);
    let floor = Infinity;
    for (const mv of P.moves) {
      if (mv.price >= floor) continue;
      const t = mv.m.apply(x, 0, mv.args as never, v);
      if (!("invalid" in t) && u(t.cells) >= uStar - 1e-9) floor = mv.price;
    }
    let heuristic = rule.parts ? separable(rule, params, x.cells, s.cells, uStar, v) : Infinity;
    for (const h of rule.searches) for (const t of h.propose(x, uStar, params, r)) {
      if ("invalid" in inDomain(t, v)) continue;
      const c = rewritePrice(x.cells, t.cells, v);
      if (c < heuristic && u(t.cells) >= uStar - 1e-9) heuristic = c;
    }
    samples.push({ direct, floor, heuristic, cost: Math.min(direct, floor, heuristic) });
  }
  return { energy: samples.reduce((t, x) => t + x.cost, 0) / K, u: uStar, K, samples };
}
