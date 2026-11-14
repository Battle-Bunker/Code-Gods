/**
 * Shared measuring tools for the landscape scripts (scripts/landscape.ts, scripts/collapse-check.ts;
 * docs/engine-v2/landscape-analysis.md). Analysis only: nothing here changes game behaviour.
 *
 * The coordinate model (`Space`): a variant's object as a vector of whole numbers whose read length is a sum over the
 * coordinates (line-z: m and c; line-q: a, b and c of ax + by + c = 0; a 4×4 grid: its 16 cells). Moving one coordinate
 * by k is one call of one mutator (line-z: si.tilt / si.shift; line-q: gen.nudge; grids: cells.add) whose fee and
 * surcharge are read from v2-core's `applyPriced`, and one call is one act, charged W + β·W². The cheapest energy to
 * reach a state is then a sum of one-dimensional cheapest paths (jumps of up to K per act). Other mutators (pivots,
 * slides, stretches, swaps…) can only make a state cheaper, so the sets below are subsets of what is truly reachable.
 */
import { applyPriced, rng, variantMutators, type ObjectType, type Rng, type Variant } from "@workspace/v2-core";
import { gridPresets, gridType, grid4, type GridState } from "@workspace/v2-grid";
import { lineQ, lineType, lineZ, normalise, presets, type LineState } from "@workspace/v2-linear";
import { findValues, valuer } from "../src/harness.ts";

// ---------------------------------------------------------------- small numeric helpers

/** Table total on one object: Σ_i n_i · Σ_{j≠i} n_j. */
export const total = (n: readonly number[]): number => { const t = n.reduce((a, b) => a + b, 0); return n.reduce((a, x) => a + x * (t - x), 0); };
export const median = (xs: readonly number[]): number => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
export function gauss(r: Rng): number { return Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit()); }
export function corr(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  const n = xs.length; if (n < 3) return 0;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]!; my += ys[i]!; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i]! - mx, b = ys[i]! - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** A binary min-heap of [priority, payload] pairs. */
export class MinHeap<T> {
  private h: [number, T][] = [];
  get size() { return this.h.length; }
  push(d: number, x: T) { const h = this.h; h.push([d, x]); let j = h.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (h[p]![0] <= h[j]![0]) break; [h[p], h[j]] = [h[j]!, h[p]!]; j = p; } }
  pop(): [number, T] {
    const h = this.h, top = h[0]!, last = h.pop()!;
    if (h.length) { h[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let s = j; if (l < h.length && h[l]![0] < h[s]![0]) s = l; if (r < h.length && h[r]![0] < h[s]![0]) s = r; if (s === j) break; [h[s], h[j]] = [h[j]!, h[s]!]; j = s; } }
    return top;
  }
}

// ---------------------------------------------------------------- pools and rules

export type Rule = { family: string; params: Record<string, unknown>; tieBreaker: string };
export const ruleName = (r: Rule) => `${r.family}/${r.tieBreaker}`;
export type VariantId = "line-z" | "line-q" | "grid-4-d10";
export const VARIANTS: readonly VariantId[] = ["line-q", "line-z", "grid-4-d10"];

/**
 * The dealable rules of a variant's pool (the first preset whose variant it is, so a preset's id moving between variants
 * changes nothing here), each family with each tie-breaker; `skipped` are those without a committed value function.
 */
export function poolOf(variant: VariantId): { rules: Rule[]; skipped: string[]; preset: string } {
  const preset = variant === "grid-4-d10" ? gridPresets.find(p => p.variant === variant) : presets.find(p => p.variant === variant);
  if (!preset) throw new Error(`no preset deals ${variant}`);
  const all: Rule[] = preset.rules.flatMap(r => (r.tieBreakers as readonly string[]).map(t => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: t })));
  return { rules: all.filter(r => findValues(variant, r)), skipped: all.filter(r => !findValues(variant, r)).map(ruleName), preset: preset.id };
}

// ---------------------------------------------------------------- the coordinate model

export interface Space<S = unknown> {
  readonly id: VariantId;
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly dims: number;
  /** The most a single act moves one coordinate in the path search. */
  readonly K: number;
  /** Fixed bounds per coordinate (grids: 0..9; line-q's b ≥ 0); null where unbounded. */
  readonly bounds: readonly ([number, number] | null)[];
  coords(s: S): number[];
  /** The state at x, or null when x is not a canonical state of the variant. */
  state(x: readonly number[]): S | null;
  /** fee(d, k): the call's price without its surcharge, for moving coordinate d by k; phi(d, v): coordinate d's read length. */
  fee(d: number, k: number): number;
  phi(d: number, v: number): number;
  /** Bits of a rule at a state (n_i). */
  bits(rule: Rule): (s: S) => number;
}

function memo<K, V>(f: (k: K) => V): (k: K) => V { const m = new Map<K, V>(); return k => { let v = m.get(k); if (v === undefined) { v = f(k); m.set(k, v); } return v; }; }

/** Moving coordinate d by k as one wire call. */
type CallOf = (d: number, k: number) => { mutator: string; args: Record<string, string> };

function makeSpace<S>(id: VariantId, type: ObjectType<S>, variant: Variant, o: {
  dims: number; K: number; bounds: ([number, number] | null)[]; coords(s: S): number[]; state(x: readonly number[]): S | null;
  call: CallOf; /** A probe state for coordinate d where every move of up to ±K is valid (two, to check the fee is state-free). */
  probes(d: number, k: number): [number[], number[]];
}): Space<S> {
  const ms = variantMutators(type, variant);
  const read = (x: readonly number[]) => type.readLength(o.state(x)!, variant);
  const priceOf = (x: number[], d: number, k: number) => {
    const c = o.call(d, k), m = ms.find(y => y.id === c.mutator)!;
    const r = applyPriced(type, variant, o.state(x)!, m, 0, m.args(variant).decode(c.args));
    if ("invalid" in r) throw new Error(`${id}: probe ${c.mutator} ${JSON.stringify(c.args)} at ${x}: ${r.invalid}`);
    const y = x.slice(); y[d] = y[d]! + k;
    if (type.encode(r.result) !== type.encode(o.state(y)!)) throw new Error(`${id}: ${c.mutator} moved ${x} somewhere other than ${y}`);
    const sur = Math.max(0, read(y) - read(x));
    if (Math.abs(r.price.surcharge - sur) > 1e-9) throw new Error(`${id}: surcharge ${r.price.surcharge} is not the read-length rise ${sur}`);
    return r.price.total - sur;
  };
  const fees = new Map<string, number>();
  const fee = (d: number, k: number) => {
    const key = `${d}:${k}`;
    let f = fees.get(key);
    if (f === undefined) {
      const [p, q2] = o.probes(d, k);
      f = priceOf(p, d, k);
      const g = priceOf(q2, d, k);
      if (Math.abs(f - g) > 1e-9) throw new Error(`${id}: the fee of moving coordinate ${d} by ${k} depends on the state (${f} vs ${g})`);
      fees.set(key, f);
    }
    return f;
  };
  const phis = Array.from({ length: o.dims }, (_, d) => memo((v: number) => {
    const [p] = o.probes(d, 1), x = p.slice(); x[d] = v;
    const base = p.slice(); base[d] = o.bounds[d]?.[0] ?? 0;
    return read(x) - read(base);
  }));
  const bitsMemo = new Map<string, (s: S) => number>();
  return {
    id, type, variant, dims: o.dims, K: o.K, bounds: o.bounds, coords: o.coords, state: o.state, fee, phi: (d, v) => phis[d]!(v),
    bits: rule => {
      const k = ruleName(rule);
      let b = bitsMemo.get(k);
      if (!b) {
        const raw = valuer(type, variant, rule).bits, cache = new Map<string, number>();
        b = s => { const key = type.encode(s); let v = cache.get(key); if (v === undefined) { if (cache.size > 1_000_000) cache.clear(); v = raw(s); cache.set(key, v); } return v; };
        bitsMemo.set(k, b);
      }
      return b;
    },
  };
}

const lineCall = (ids: string[]): CallOf => (d, k) => ({ mutator: ids[d]!, args: { k: String(k) } });

export function spaceOf(id: VariantId): Space<any> {
  if (id === "line-z") return makeSpace<LineState>(id, lineType, lineZ, {
    dims: 2, K: 64, bounds: [null, null],
    coords: s => { const l = s.lines[0]!; return [Number(-l.a), Number(-l.c)]; },   // b = 1: y = mx + c
    state: x => ({ lines: [{ a: BigInt(-x[0]!), b: 1n, c: BigInt(-x[1]!) }] }),
    call: lineCall(["si.tilt", "si.shift"]),
    probes: () => [[0, 0], [3, 5]],
  });
  if (id === "line-q") {
    const COEF = ["a", "b", "c"];
    return makeSpace<LineState>(id, lineType, lineQ, {
      dims: 3, K: 64, bounds: [null, [0, Number.MAX_SAFE_INTEGER], null],
      coords: s => { const l = s.lines[0]!; return [Number(l.a), Number(l.b), Number(l.c)]; },
      state: x => {
        const [a, b, c] = x.map(v => BigInt(v)) as [bigint, bigint, bigint];
        const n = normalise(a, b, c);
        return "invalid" in n || n.a !== a || n.b !== b || n.c !== c ? null : { lines: [n] };
      },
      call: (d, k) => ({ mutator: "gen.nudge", args: { which: COEF[d]!, k: String(k) } }),
      // Another coordinate held at 1, so a nudge never leaves a common factor; b probed above K when k < 0.
      probes: (d, k) => (d === 0 ? [[0, 1, 1], [2, 1, 3]] : d === 1 ? (k < 0 ? [[1, 70, 1], [1, 90, 3]] : [[1, 0, 1], [1, 3, 1]]) : [[1, 1, 0], [3, 1, 5]]),
    });
  }
  return makeSpace<GridState>(id, gridType, grid4, {
    dims: 16, K: 9, bounds: Array.from({ length: 16 }, () => [0, 9] as [number, number]),
    coords: s => s.cells.slice(),
    state: x => (x.every(v => v >= 0 && v <= 9) ? { cells: x.slice() } : null),
    call: (d, k) => ({ mutator: "cells.add", args: { cell: `r${Math.floor(d / 4)}c${d % 4}`, k: String(k) } }),
    probes: (d, k) => { const p = Array<number>(16).fill(0), q2 = Array<number>(16).fill(3); p[d] = k > 0 ? 0 : 9; q2[d] = k > 0 ? 0 : 9; return [p, q2]; },
  });
}

/** The act charge for one call of W bits: W + β·W² (v2-economy's changeCharge with β a parameter). */
export const actCharge = (w: number, beta: number) => w + beta * w * w;

/**
 * Cheapest energy from x0 to every value of coordinate d (one call per act, jumps up to K), up to maxE. Returns the
 * values with their costs (only those ≤ maxE), cheapest first.
 */
export function costs1D(space: Space, d: number, x0: number, beta: number, maxE: number): { v: number; e: number }[] {
  const b = space.bounds[d];
  for (let X = 2048; ; X *= 2) {
    const lo = b ? Math.max(b[0], x0 - X) : x0 - X, hi = b ? Math.min(b[1], x0 + X) : x0 + X, N = hi - lo + 1;
    const cost = new Float64Array(N).fill(Infinity), done = new Uint8Array(N), ph = new Float64Array(N);
    for (let i = 0; i < N; i++) ph[i] = space.phi(d, lo + i);
    const fee = new Float64Array(2 * space.K + 1);
    for (let k = -space.K; k <= space.K; k++) if (k) fee[k + space.K] = space.fee(d, k);
    const heap = new MinHeap<number>();
    cost[x0 - lo] = 0; heap.push(0, x0 - lo);
    let edge = false;
    while (heap.size) {
      const [e, i] = heap.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (e > maxE) break;
      if (i === 0 && !(b && lo === b[0]) || i === N - 1 && !(b && hi === b[1])) edge = true;
      for (let k = -space.K; k <= space.K; k++) {
        const j = i + k; if (!k || j < 0 || j >= N || done[j]) continue;
        const ne = e + actCharge(fee[k + space.K]! + Math.max(0, ph[j]! - ph[i]!), beta);
        if (ne < cost[j]! && ne <= maxE) { cost[j] = ne; heap.push(ne, j); }
      }
    }
    if (edge && X < 1 << 20) continue;
    const out: { v: number; e: number }[] = [];
    for (let i = 0; i < N; i++) if (cost[i]! <= maxE) out.push({ v: lo + i, e: cost[i]! });
    return out.sort((p, q2) => p.e - q2.e);
  }
}

/** The energy-reachable set from x0 within E, as per-coordinate cost lists (a state costs the sum over coordinates). */
export interface Reach { readonly x0: readonly number[]; readonly E: number; readonly per: readonly { v: number; e: number }[][]; readonly costOf: readonly Map<number, number>[] }
export function reach(space: Space, x0: readonly number[], beta: number, E: number): Reach {
  const per = x0.map((v, d) => costs1D(space, d, v, beta, E));
  return { x0, E, per, costOf: per.map(l => new Map(l.map(p => [p.v, p.e]))) };
}
export const costAt = (r: Reach, x: readonly number[]): number => { let t = 0; for (let d = 0; d < x.length; d++) { const e = r.costOf[d]!.get(x[d]!); if (e === undefined) return Infinity; t += e; } return t; };

/** How many coordinate vectors cost at most E (canonical or not), by convolving per-coordinate cost histograms. */
export function countWithin(r: Reach, E: number, bins = 4000): number {
  const w = E / bins;
  let acc = new Float64Array(bins + 1); acc[0] = 1;
  for (const l of r.per) {
    const h = new Float64Array(bins + 1);
    for (const p of l) { const b = Math.floor(p.e / w); if (b <= bins) h[b]!++; }
    const next = new Float64Array(bins + 1);
    for (let i = 0; i <= bins; i++) if (acc[i]) for (let j = 0; i + j <= bins; j++) if (h[j]) next[i + j]! += acc[i]! * h[j]!;
    acc = next;
  }
  return acc.reduce((a, b) => a + b, 0);
}

/** Every canonical state within E (only for small sets: call countWithin first). */
export function enumerate(space: Space, r: Reach, E: number, visit: (x: number[], e: number) => void): void {
  const x = Array<number>(space.dims).fill(0);
  const rest = r.per.map((_, d) => r.per.slice(d + 1).reduce((t, l) => t + (l[0]?.e ?? 0), 0));   // the least the later coordinates add
  const go = (d: number, e: number) => {
    if (d === space.dims) { if (space.state(x)) visit(x.slice(), e); return; }
    for (const p of r.per[d]!) { if (e + p.e + rest[d]! > E) break; x[d] = p.v; go(d + 1, e + p.e); }
  };
  go(0, 0);
}

/** Up to n states drawn uniformly from the canonical states within E (rejection sampling, at most 50·n tries). */
export function sample(space: Space, r: Reach, E: number, n: number, seed: string): number[][] {
  const R = rng("sample", seed), out: number[][] = [];
  for (let tries = 0; out.length < n && tries < 50 * n; tries++) {
    const x = r.per.map(l => l[R.below(l.length)]!.v);
    if (costAt(r, x) <= E && space.state(x)) out.push(x);
  }
  return out;
}

/**
 * Simulated annealing on f inside the reachable set: `evals` calls of f, split over `restarts` runs from x0. A step moves
 * one coordinate by ±1..±3, sometimes up to ±30 (grids: to any digit half the time). `seen` gets every state evaluated.
 */
export function anneal(space: Space, r: Reach, f: (x: number[]) => number, evals: number, restarts: number, seed: string, seen?: (x: number[], v: number) => void): { best: number; at: number[] } {
  const R = rng("anneal", seed);
  let best = -Infinity, at = r.x0.slice();
  const per = Math.max(1, Math.floor(evals / restarts));
  for (let run = 0; run < restarts; run++) {
    let x = r.x0.slice(), e = costAt(r, x), v = f(x), scale = Math.max(1, Math.abs(v));
    seen?.(x, v);
    if (v > best) { best = v; at = x.slice(); }
    for (let t = 1; t < per; t++) {
      const d = R.below(space.dims), y = x.slice();
      const b = space.bounds[d];
      const u = R.unit();
      if (b && b[1] - b[0] <= 9 && u < 0.5) y[d] = b[0] + R.below(b[1] - b[0] + 1);
      else y[d] = y[d]! + (R.unit() < 0.5 ? -1 : 1) * (u < 0.8 ? 1 + R.below(3) : 1 + R.below(30));
      if (y[d] === x[d]) continue;
      const ey = costAt(r, y);
      if (ey > r.E || !space.state(y)) continue;
      const w = f(y);
      seen?.(y, w);
      scale = Math.max(scale, Math.abs(w));
      const T = scale * (0.3 * (1 - t / per) + 1e-3);
      if (w >= v || R.unit() < Math.exp((w - v) / T)) { x = y; v = w; e = ey; void e; if (v > best) { best = v; at = x.slice(); } }
    }
  }
  return { best, at };
}

/**
 * H4: probes until the other two players' rules are identified from their disclosed summed bits (exact when sigma = 0).
 * Probes are births; a pair counts as identified when its posterior reaches 0.95. Returns the probes each trial needed.
 * With `keyOf`, the noise is the server's (convex/v2/disclose.ts): a keyed function of the state alone, Gaussian with
 * deviation sigma, so a state that recurs shows the same noise and cannot be averaged; without it, a fresh draw a probe.
 */
export function identify<S>(rules: readonly Rule[], bits: (r: Rule) => (s: S) => number, probes: readonly S[], trials: number, sigma: number, seed: string, cap = 3000, keyOf?: (s: S) => string): { need: number[]; unidentified: number } {
  const r = rng("ident", seed);
  const noiseAt = (k: number, trial: number) => (!sigma ? 0 : keyOf ? sigma * gauss(rng("disclose", seed, trial, keyOf(probes[k]!))) : sigma * gauss(r));
  const cache = rules.map(rule => { const b = bits(rule); return probes.map(p => b(p)); });
  const need: number[] = []; let unidentified = 0;
  for (let trial = 0; trial < trials; trial++) {
    const fams = [...new Set(rules.map(x => x.family))];
    if (fams.length < 3) break;
    const own = fams[r.below(fams.length)]!;
    const cand: [number, number][] = [];
    for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i]!, b = rules[j]!;
      if (a.family !== b.family && a.family !== own && b.family !== own) cand.push([i, j]);
    }
    const truth = r.below(cand.length), [ti, tj] = cand[truth]!;
    const logp = new Float64Array(cand.length);
    const order = probes.map((_, k) => k).sort(() => r.unit() - 0.5).slice(0, cap);
    let n = 0, done = false;
    for (const k of order) {
      n++;
      const obs = cache[ti]![k]! + cache[tj]![k]! + noiseAt(k, trial);   // each trial is its own game: its own key
      for (let c = 0; c < cand.length; c++) {
        const [i, j] = cand[c]!, pred = cache[i]![k]! + cache[j]![k]!;
        logp[c]! += sigma ? -((obs - pred) ** 2) / (2 * sigma * sigma) : Math.abs(obs - pred) < 1e-9 ? 0 : -Infinity;
      }
      let mx = -Infinity; for (const x of logp) mx = Math.max(mx, x);
      let z = 0; for (const x of logp) z += Math.exp(x - mx);
      if (Math.exp(logp[truth]! - mx) / z >= 0.95) { done = true; break; }
    }
    if (!done) unidentified++;
    need.push(done ? n : Infinity);
  }
  return { need, unidentified };
}
