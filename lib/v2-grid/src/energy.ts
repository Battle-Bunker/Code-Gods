/**
 * A board's energy for a grid rule (the owner, 17 Nov; docs/engine-v2/energy.md, "Grids"; the machinery is v2-core
 * free-energy.ts):
 *
 *   energy(s) = mean over K uniformly random boards x of c(x),   c(x) = −log2 Σ_routes 2^−bits(route)
 *
 * Grids have no size, so a turn costs naming bits only: per mutation, which move (log2 of the variant's moves), which
 * cells or lines (log2 of the choices), the amount's digits (a sign bit and log2 10 per digit), and one "continue" bit.
 * The starts are stratified: across the K boards each cell's digit is a Latin-hypercube draw (K = 20: each digit twice).
 * Routes per start: the universal greedy climb over every single mutation, the direct turn onto s (rewrite the cells
 * that differ), the separable rules' cheapest group rewrites onto their anchors (a Pareto front per group, merged), and
 * the rule's own `candidates`. Nothing is computed at import time; move lists and anchors are built per variant and
 * rule on first use.
 */
import { latinHypercube, meanAndSpread, rng as makeRng, startCost, whichBits, type Estimate, type EstimateOpts, type Mutator, type RouteSpace, type Variant } from "@workspace/v2-core";
import { encodeGrid, gridParams, type GridState } from "./grid.ts";
import type { GridDynamicRule } from "./dynamic-families.ts";
import { gridMutators, type GridArgs } from "./mutators.ts";

/** Starts a server estimate averages. */
export const GRID_STARTS = 20;
/** The "continue" bit each mutation of a turn carries. */
const CONTINUE = 1;

/** The naming bits of an amount k: its sign and its decimal digits. */
export const amountNamingBits = (k: number): number => 1 + Math.log2(10) * String(Math.abs(Math.trunc(k))).length;

// ------------------------------------------------------------------ the moves and their naming (per variant)

/**
 * A move compiled to new[i] = old[src[i]] + add[i] (every dealt grid move is a rearrangement plus fixed amounts; found
 * by applying it to two probe boards on an uncapped copy of the variant). `touched`: the cells it may change.
 */
interface Move { readonly m: Mutator<GridState, GridArgs>; readonly args: GridArgs; readonly bits: number; readonly src: Int16Array; readonly add: Int16Array; readonly touched: readonly number[] }
interface Naming { readonly moves: readonly Move[]; readonly cellBits: number }
function compile(m: Mutator<GridState, GridArgs>, args: GridArgs, v: Variant): Pick<Move, "src" | "add" | "touched"> | null {
  const n2 = gridParams(v).size ** 2, wide: Variant = { ...v, params: { ...v.params, cap: 1e6 } };
  const probe = (off: number) => { const t = m.apply({ cells: Array.from({ length: n2 }, (_, i) => 1000 * (i + 1) + off) }, 0, args, wide); return "invalid" in t ? null : t.cells; };
  const a = probe(500), b = probe(700);
  if (!a || !b) return null;
  const src = new Int16Array(n2), add = new Int16Array(n2), touched: number[] = [];
  for (let i = 0; i < n2; i++) {
    const j = Math.round((a[i]! - 500) / 1000) - 1, d = a[i]! - 1000 * (j + 1) - 500;
    if (j < 0 || j >= n2 || b[i]! - 1000 * (j + 1) - 700 !== d) return null;
    src[i] = j; add[i] = d;
    if (j !== i || d !== 0) touched.push(i);
  }
  return touched.length ? { src, add, touched } : null;
}
const NAMING = new Map<string, Naming>();
/** Every single mutation of the variant (amounts up to the cap either way) with its naming bits. */
export function gridNaming(v: Variant): Naming {
  let nm = NAMING.get(v.id);
  if (nm) return nm;
  const { cap } = gridParams(v), moves: Move[] = [];
  for (const m of gridMutators(gridParams(v).size).filter(m => v.mutators.includes(m.id))) {
    const all = [...(m.args(v).enumerate?.(64) ?? [])] as GridArgs[];
    if (!all.length) continue;
    const fields = Object.keys(all[0]!).filter(f => f !== "k"), amount = "k" in all[0]!;
    const choice = fields.reduce((t, f) => t + Math.log2(new Set(all.map(a => a[f])).size), 0), which = whichBits(v, m.id);
    const seen = new Set<string>(), effects = new Set<string>();
    const push = (args: GridArgs, bits: number) => {
      const c = compile(m, args, v);
      if (!c) return;
      const key = `${c.src.join(",")}|${c.add.join(",")}`;   // one move per effect (swap a, b is swap b, a)
      if (effects.has(key)) return;
      effects.add(key);
      moves.push({ m, args, bits, ...c });
    };
    for (const a of all) {
      const key = fields.map(f => a[f]).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const base = Object.fromEntries(fields.map(f => [f, a[f]!]));
      if (!amount) { push(base, which + choice + CONTINUE); continue; }
      for (let k = 1; k <= cap; k++) for (const kk of [k, -k]) push({ ...base, k: kk }, which + choice + amountNamingBits(kk) + CONTINUE);
    }
  }
  const add = moves.find(x => x.m.id === "cells.add");
  NAMING.set(v.id, nm = { moves, cellBits: add ? add.bits : Infinity });
  return nm;
}

/** The naming bits of rewriting x into t one cell at a time (each changed cell one "add to one cell"). */
export function rewriteBits(x: readonly number[], t: readonly number[], v: Variant): number {
  const { cellBits } = gridNaming(v);
  let n = 0;
  for (let i = 0; i < t.length; i++) if (t[i] !== x[i]) n++;
  return n * cellBits;
}

/**
 * The universal greedy climb on a board (free-energy.ts greedyClimb, made fast): every compiled move, the best utility
 * gain per naming bit (the gain capped at what is still needed) until u ≥ uStar. For a separable rule a move's gain is
 * the change in the groups it touches, cached between steps until one of those groups changes.
 */
function climbGrid<P>(rule: GridDynamicRule<P>, params: P, v: Variant, maxSteps = 24) {
  const { moves } = gridNaming(v), { cap } = gridParams(v), n2 = gridParams(v).size ** 2, n = Math.round(Math.sqrt(n2));
  const parts = rule.parts, groups = parts ? parts.groups(n, params) : [];
  const groupOf = new Int16Array(n2).fill(-1);
  groups.forEach((g, gi) => { for (const i of g) groupOf[i] = gi; });
  const touchedGroups = moves.map(mv => [...new Set(mv.touched.map(i => groupOf[i]!).filter(g => g >= 0))]);
  const uFull = (cells: readonly number[]) => { const x = rule.u({ cells }, params); return Number.isNaN(x) ? -Infinity : x; };
  const buf = groups.map(g => new Array<number>(g.length).fill(0));
  return (x: GridState, uStar: number, bound = Infinity): { target: GridState; bits: number } | null => {
    const cur = x.cells.slice(), next = cur.slice();
    let uy = uFull(cur), naming = 0;
    const partOf = (gi: number, cells: readonly number[]) => { const g = groups[gi]!, b = buf[gi]!; for (let j = 0; j < g.length; j++) b[j] = cells[g[j]!]!; return parts!.part(b, params); };
    const partNow = groups.map((_, gi) => partOf(gi, cur));
    const gain = new Float64Array(moves.length), stale = new Uint8Array(moves.length).fill(1);
    /** Writes the move's touched cells into `next` (the rest of `next` equals `cur`); false when a cell leaves 0 … cap. */
    const write = (mv: Move): boolean => {
      for (const i of mv.touched) { const t = cur[mv.src[i]!]! + mv.add[i]!; if (t < 0 || t > cap) { restore(mv); return false; } next[i] = t; }
      return true;
    };
    const restore = (mv: Move) => { for (const i of mv.touched) next[i] = cur[i]!; };
    for (let step = 0; step < maxSteps && uy < uStar - 1e-9; step++) {
      if (naming > bound) return null;
      let best = -1, bestRate = 0;
      for (let k = 0; k < moves.length; k++) {
        const mv = moves[k]!;
        if (stale[k] || !parts) {
          stale[k] = 0;
          if (!write(mv)) { gain[k] = -Infinity; continue; }
          if (parts) { let d = 0; for (const gi of touchedGroups[k]!) d += partOf(gi, next) - partNow[gi]!; gain[k] = d; }
          else gain[k] = uFull(next) - uy;
          restore(mv);
        }
        const g = gain[k]!;
        if (!(g > 1e-12)) continue;
        const rate = Math.min(g, uStar - uy) / mv.bits;
        if (rate > bestRate) { bestRate = rate; best = k; }
      }
      if (best < 0) return null;
      const mv = moves[best]!;
      write(mv);
      for (const i of mv.touched) cur[i] = next[i]!;
      naming += mv.bits;
      if (parts) {
        const changed = touchedGroups[best]!;
        for (const gi of changed) partNow[gi] = partOf(gi, cur);
        uy = partNow.reduce((t, p) => t + p, 0);
        for (let k = 0; k < moves.length; k++) if (touchedGroups[k]!.some(gi => changed.includes(gi))) stale[k] = 1;
      } else uy = uFull(cur);
    }
    if (uy < uStar - 1e-9) return null;
    return { target: { cells: cur }, bits: Math.min(naming, rewriteBits(x.cells, cur, v)) };
  };
}

/** The route space of a rule on a variant. */
function space<P>(rule: GridDynamicRule<P>, params: P, v: Variant): RouteSpace<GridState> {
  const { moves } = gridNaming(v);
  return {
    key: encodeGrid,
    u: s => rule.u(s, params),
    *moves(y) {
      for (const mv of moves) { const t = mv.m.apply(y, 0, mv.args, v); if (!("invalid" in t)) yield { to: t, bits: mv.bits }; }
    },   // the generic climb's moves (climbGrid is the same climb, faster)
    surprise: () => 0,
    name: (x, t) => rewriteBits(x.cells, t.cells, v),
  };
}

// ------------------------------------------------------------------ the separable candidates

interface Option { readonly c: number; readonly u: number; readonly cells: readonly number[] }
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
/**
 * The cheapest boards (up to `most`) reaching Σ parts ≥ uStar by rewriting whole groups onto anchors, onto s's group, or
 * leaving them: a Pareto front of naming bits and utility per group, merged exactly.
 */
function separable<P>(rule: GridDynamicRule<P>, params: P, x: readonly number[], s: readonly number[], uStar: number, v: Variant, most = 4): GridState[] {
  const { cellBits } = gridNaming(v), n = Math.round(Math.sqrt(x.length)), { groups, anchors } = anchored(rule, params, n), part = rule.parts!.part;
  let acc: Option[] = [{ c: 0, u: 0, cells: x }];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!, xs = g.map(i => x[i]!), ss = g.map(i => s[i]!);
    // Rewriting costs cellBits per changed cell, so a group's front has one best option per count of changed cells.
    const bestByCount: ({ u: number; ds: readonly number[] } | null)[] = Array(g.length + 1).fill(null);
    const offer = (ds: readonly number[], u: number) => {
      let d = 0;
      for (let k = 0; k < ds.length; k++) if (ds[k] !== xs[k]) d++;
      const b = bestByCount[d];
      if (!b || u > b.u) bestByCount[d] = { u, ds };
    };
    offer(xs, part(xs, params));
    offer(ss, part(ss, params));
    for (const a of anchors[gi]!) offer(a.ds, a.u);
    const f = front(bestByCount.flatMap((b, d) => (b ? [{ c: d * cellBits, u: b.u, cells: b.ds }] : [])));
    const next: Option[] = [];
    for (const a of acc) for (const b of f) {
      const cells = a.cells.slice();
      g.forEach((i, k) => { cells[i] = b.cells[k]!; });
      next.push({ c: a.c + b.c, u: a.u + b.u, cells });
    }
    acc = front(next);
  }
  return acc.filter(o => o.u >= uStar - 1e-9).slice(0, most).map(o => ({ cells: o.cells }));
}

// ------------------------------------------------------------------ the estimate

/** K uniformly random boards, stratified: each cell a Latin-hypercube draw over the digits 0 … cap. */
export function gridStarts(v: Variant, K: number, seed: string): GridState[] {
  const { size, cap } = gridParams(v), r = makeRng("grid-starts", seed);
  return latinHypercube(K, size * size, () => r.unit(), k => r.below(k)).map(row => ({ cells: row.map(t => Math.min(cap, Math.floor(t * (cap + 1)))) }));
}

export interface GridSample { readonly cost: number; readonly best: number; readonly universal: number; readonly by: string }
export interface GridEstimate extends Estimate { readonly spread: number; readonly samples: readonly GridSample[] }
let fresh = 0;
/** energy(s) under a grid rule on a variant, in bits: the mean of c(x) over stratified uniform boards. */
export function estimateGrid<P>(s: GridState, rule: GridDynamicRule<P>, params: P, v: Variant, o: EstimateOpts = {}): GridEstimate {
  const K = o.K ?? GRID_STARTS, seed = o.seed ?? `fresh:${Date.now()}:${fresh++}:${Math.random()}`;
  const sp = space(rule, params, v), climb = climbGrid(rule, params, v), raw = rule.u(s, params), uStar = Number.isNaN(raw) ? -Infinity : raw;
  const samples = gridStarts(v, K, seed).map(x => {
    const cands = [...(rule.parts ? separable(rule, params, x.cells, s.cells, uStar, v) : []), ...(rule.candidates?.(x, uStar, params) ?? [])];
    const c = startCost(x, s, uStar, sp, cands, (x0, u0, _sp, bound) => climb(x0, u0, bound));
    return { cost: c.cost, best: c.best, universal: c.universal, by: c.by };
  });
  const { energy, spread } = meanAndSpread(samples.map(x => x.cost));
  return { energy, spread, u: uStar, K, samples };
}
