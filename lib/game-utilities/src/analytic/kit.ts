/**
 * Exact-distribution toolkit for analytic calibration (docs/analytic-calibration/playbook.md).
 *
 * A `Dist` is a finite distribution over integer vectors (an ordinal, or an ordinal plus DP state). Every exact
 * solution in this folder is built from three moves:
 *  - `dist` / `uniform`: the law of one independent piece (a cell, a row, a block);
 *  - `combine(a, b, f)`: the law of f(X, Y) for independent X ~ a, Y ~ b, merging equal outcomes (this one
 *    operation is convolution, a Markov-chain step and a transfer-matrix step, depending on f);
 *  - `levels(d)`: log2 μ{u ≥ t} for every attainable ordinal t, summed from the top so tiny tails keep full
 *    relative precision (all terms are positive: never subtract probabilities).
 */
import type { Ordinal } from "../types.ts";

export type Vec = readonly number[];
/** Outcome vector → probability (keys are `v.join(",")`). */
export type Dist = Map<string, { readonly v: Vec; p: number }>;
/** [ordinal, log2 μ{u ≥ ordinal}] for every attainable ordinal, increasing (the EXACT_TAILS level format). */
export type Levels = readonly (readonly [Ordinal, number])[];

const key = (v: Vec) => v.join(",");

export function dist(entries: Iterable<readonly [Vec, number]>): Dist {
  const d: Dist = new Map();
  for (const [v, p] of entries) add(d, v, p);
  return d;
}
export function add(d: Dist, v: Vec, p: number): void {
  if (p <= 0) return;
  const k = key(v), e = d.get(k);
  if (e) e.p += p; else d.set(k, { v: v.map(x => x + 0), p }); // + 0 turns −0 (e.g. −|0|) into 0
}
/** The point mass at v. */
export const point = (v: Vec): Dist => dist([[v, 1]]);
/** Uniform over the given outcomes (repeats add weight). */
export const uniform = (vs: readonly Vec[]): Dist => dist(vs.map(v => [v, 1 / vs.length] as const));

/** Law of f(X, Y) for independent X ~ a, Y ~ b. f may return null to drop an outcome (a conditioning step). */
export function combine(a: Dist, b: Dist, f: (x: Vec, y: Vec) => Vec | null): Dist {
  const out: Dist = new Map();
  for (const x of a.values()) for (const y of b.values()) {
    const v = f(x.v, y.v);
    if (v) add(out, v, x.p * y.p);
  }
  return out;
}
/** Law of f(X). */
export function map(a: Dist, f: (x: Vec) => Vec): Dist {
  const out: Dist = new Map();
  for (const x of a.values()) add(out, f(x.v), x.p);
  return out;
}
/** Componentwise sum of independent vectors (convolution). */
export const sum = (a: Dist, b: Dist): Dist => combine(a, b, (x, y) => x.map((xi, i) => xi + y[i]));
/** Sum of n iid copies (binary powering). */
export function power(a: Dist, n: number, zero: Vec = [...a.values()][0].v.map(() => 0)): Dist {
  let acc = point(zero), base = a;
  for (let k = n; k > 0; k >>= 1) {
    if (k & 1) acc = sum(acc, base);
    if (k > 1) base = sum(base, base);
  }
  return acc;
}
/** Sum of independent pieces. */
export const sumAll = (pieces: readonly Dist[], zero: Vec): Dist => pieces.reduce(sum, point(zero));
/** Iterate a chain: d ← combine(d, step, f) n times (one letter per step, e.g. one cell along a line). */
export function chain(start: Dist, step: Dist, n: number, f: (x: Vec, y: Vec) => Vec | null): Dist {
  let d = start;
  for (let i = 0; i < n; i++) d = combine(d, step, f);
  return d;
}
/** Total mass (1 unless the dist was conditioned). */
export const mass = (d: Dist): number => { let s = 0; for (const e of d.values()) s += e.p; return s; };

function cmpVec(a: Vec, b: Vec): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/**
 * Survival levels of an ordinal distribution: every attainable ordinal t (ascending) with log2 μ{u ≥ t}.
 * Arity-1 vectors become scalar ordinals.
 */
export function levels(d: Dist): Levels {
  const es = [...d.values()].sort((a, b) => cmpVec(a.v, b.v));
  const out: [Ordinal, number][] = new Array(es.length);
  let tail = 0;
  for (let i = es.length - 1; i >= 0; i--) {
    tail += es[i].p;
    out[i] = [es[i].v.length === 1 ? es[i].v[0] : [...es[i].v], Math.log2(tail)];
  }
  return out;
}

/** log2 μ{u ≥ t} at any ordinal t (attainable or not) from a full level list; -Infinity above the top. */
export function log2SurvivalAt(L: Levels, t: Ordinal): number {
  const tv = typeof t === "number" ? [t] : t;
  let lo = 0, hi = L.length; // first level ≥ t
  while (lo < hi) {
    const mid = (lo + hi) >> 1, o = L[mid][0], ov = typeof o === "number" ? [o] : o;
    if (cmpVec(ov, tv) < 0) lo = mid + 1; else hi = mid;
  }
  return lo < L.length ? L[lo][1] : -Infinity;
}

// ------------------------------------------------------------------------------------------------
// classic closed forms
// ------------------------------------------------------------------------------------------------

/** Binomial(n, p) as a Dist over [k]. */
export function binomial(n: number, p: number): Dist {
  const out: Dist = new Map();
  let lc = 0; // log C(n,k)
  for (let k = 0; k <= n; k++) {
    if (k > 0) lc += Math.log(n - k + 1) - Math.log(k);
    const lp = lc + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log1p(-p) : 0);
    add(out, [k], p === 0 ? (k === 0 ? 1 : 0) : p === 1 ? (k === n ? 1 : 0) : Math.exp(lp));
  }
  return out;
}

/**
 * Law of the longest run of successes in n iid Bernoulli(q) trials (n ≥ 0), as a Dist over [run].
 * DP over (current run, best run).
 */
export function longestRun(n: number, q: number): Dist {
  let d = point([0, 0]);
  const step = dist([[[1], q], [[0], 1 - q]]);
  d = chain(d, step, n, ([best, run], [hit]) => { const r = hit ? run + 1 : 0; return [Math.max(best, r), r]; });
  return map(d, ([best]) => [best]);
}

/**
 * Law of the largest cell count when n balls fall iid into k equally likely boxes (the "takeover" maximum), as a
 * Dist over [max]. Exact: P(max ≤ m) = n!/k^n · [x^n] (Σ_{j≤m} x^j/j!)^k, evaluated in log-free floating point
 * with positive terms only, then differenced from the top as P(max ≥ m) = 1 − P(max ≤ m−1) computed directly as
 * the mass of occupancy vectors with some box ≥ m via the complementary DP over boxes.
 */
export function maxOccupancy(n: number, k: number): Dist {
  // DP over boxes: state (balls used so far, max so far), weight Π 1/c_i! ; multiply by n!/k^n at the end.
  // States ≤ (n+1)^2 per box, k ≤ 16 boxes: tiny.
  let d = new Map<number, number>([[0, 1]]); // key = used * (n+1) + max
  const lf = [0];
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i));
  for (let b = 0; b < k; b++) {
    const nd = new Map<number, number>();
    for (const [s, w] of d) {
      const used = Math.floor(s / (n + 1)), mx = s % (n + 1);
      for (let c = 0; used + c <= n; c++) {
        const t = (used + c) * (n + 1) + Math.max(mx, c);
        nd.set(t, (nd.get(t) ?? 0) + w * Math.exp(-lf[c]));
      }
    }
    d = nd;
  }
  const out: Dist = new Map(), scale = Math.exp(lf[n] - n * Math.log(k));
  for (const [s, w] of d) if (Math.floor(s / (n + 1)) === n) add(out, [s % (n + 1)], w * scale);
  return out;
}
