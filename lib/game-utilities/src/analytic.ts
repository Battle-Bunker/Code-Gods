/**
 * Analytic calibration: a family may compute its own survival function instead of leaving it to the Monte Carlo +
 * splitting estimator (docs/analytic-calibration/architecture.md; the mathematics in tail-toolkit.md and playbook.md).
 *
 *   G(t) = μ{u ≥ t}  for every attainable ordinal t, as log2 G, under the uniform spawn prior μ.
 *
 * A family exports `analytic(params, ctx)` returning an `AnalyticSurvival` (or null when it has no answer for these
 * params on this instantiation: the estimator then runs). The result's `id` is part of the table key (calibration.ts
 * `tableKeyParts.exact`), so bumping its version regenerates exactly the tables built from it. Every analytic ships
 * with its verification (analytic-verify.ts, test/analytic.test.ts): the levels are checked against fresh spawns, against
 * the archived Monte Carlo tables of the same family (data/analytic-reference/) and, for small domains, against exact
 * enumeration.
 *
 * The second half of this module is the toolkit the formulas are built from: finite distributions over ordinals
 * (scalars or lexicographic tuples), their sums and products, the Binomial and multinomial laws, chains along a line,
 * the maximum of multinomial counts and a row-to-row transfer matrix. All of it is exact arithmetic in doubles: masses
 * are summed from the top (the rare end) so G keeps its relative precision down to about 2^-1000.
 */
import type { Ordinal } from "./types.ts";

// ------------------------------------------------------------------------------------------------
// the family-side result
// ------------------------------------------------------------------------------------------------

/** `[ordinal, log2 G(ordinal)]`, ordinals strictly increasing. */
export type AnalyticLevels = readonly (readonly [Ordinal, number])[];

export interface AnalyticSurvival {
  /** Formula id and version ("binomial-cells@1"): part of the table key. Bump the version whenever the formula changes. */
  readonly id: string;
  /**
   * log2 μ{u ≥ t} at every attainable ordinal t (a superset is fine): ordinals strictly increasing, values non-increasing
   * and ≤ 0, the first entry 0 (the least attainable ordinal has G = 1). Scoring interpolates between levels exactly as
   * it does for estimated tables (calibration.ts `surprisal`), so listing every attainable ordinal makes the table exact.
   * May be a getter (`lazySurvival`): keys need only the id, and the levels are read once, when a table is built.
   */
  readonly levels: AnalyticLevels;
  /** "exact": closed form, exact enumeration or exact dynamic programme. "approx": every level within `maxErrorBits`. */
  readonly kind: "exact" | "approx";
  /** Approximations only: a bound on |log2 G − true log2 G| at every level, proven or verified against the reference tables. */
  readonly maxErrorBits?: number;
}

/** An approximation is used for scoring only when its error bound is at most this (well below the estimator's error). */
export const ANALYTIC_MAX_ERROR_BITS = 0.25;

const tupleOf = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);
/** Lexicographic comparison of ordinals (scalars as 1-tuples): the one comparator of the package (calibration.ts re-exports it). */
export function cmpOrdinals(a: Ordinal, b: Ordinal): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  const x = tupleOf(a), y = tupleOf(b);
  if (x.length !== y.length) throw new Error(`Cannot compare ordinals of arity ${x.length} and ${y.length}`);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Throws unless the id, kind and error bound are well formed (without reading the levels, which may be lazy). */
export function assertAnalyticHeader(a: AnalyticSurvival, where: string): void {
  if (!/^[a-z0-9-]+@\d+$/.test(a.id)) throw new Error(`${where}: analytic id ${JSON.stringify(a.id)} must look like "name@1"`);
  if (a.kind !== "exact" && a.kind !== "approx") throw new Error(`${where}: analytic kind ${String(a.kind)}`);
  if (a.kind === "approx" && !(typeof a.maxErrorBits === "number" && a.maxErrorBits >= 0)) throw new Error(`${where}: an approximation needs maxErrorBits ≥ 0`);
}
/** Throws unless `a` is well formed (see AnalyticSurvival.levels); `where` names the family for the message. */
export function assertAnalytic(a: AnalyticSurvival, where: string): void {
  assertAnalyticHeader(a, where);
  const L = a.levels;
  if (!L.length) throw new Error(`${where}: analytic has no levels`);
  if (L[0][1] !== 0) throw new Error(`${where}: the first level must have log2 G = 0 (got ${L[0][1]})`);
  for (let i = 0; i < L.length; i++) {
    const [o, l] = L[i];
    const ok = typeof o === "number" ? Number.isSafeInteger(o) : o.every(Number.isSafeInteger);
    if (!ok) throw new Error(`${where}: level ${i} ordinal ${JSON.stringify(o)} is not a whole number or tuple`);
    if (!(Number.isFinite(l) && l <= 0)) throw new Error(`${where}: level ${i} log2 G = ${l}`);
    if (i > 0) {
      if (cmpOrdinals(L[i - 1][0], o) >= 0) throw new Error(`${where}: ordinals not strictly increasing at level ${i}`);
      if (l > L[i - 1][1]) throw new Error(`${where}: log2 G increases at level ${i} (${L[i - 1][1]} → ${l})`);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// toolkit: finite distributions over ordinals
// ------------------------------------------------------------------------------------------------

/** A finite probability distribution over ordinals (scalars or tuples of one arity). */
export type Dist = ReadonlyMap<string, { readonly o: Ordinal; readonly p: number }>;
type MutDist = Map<string, { o: Ordinal; p: number }>;
/** The map key of an ordinal ("3" or "2,5"): the same for a scalar and its 1-tuple is NOT intended; arities never mix. */
export const ordinalKey = (o: Ordinal): string => (typeof o === "number" ? String(o) : o.join(","));
const keyOf = ordinalKey;

/** Adds mass p at ordinal o (p ≤ 0 is ignored). */
export function addMass(d: Map<string, { o: Ordinal; p: number }>, o: Ordinal, p: number): void {
  if (!(p > 0)) return;
  const k = keyOf(o), e = d.get(k);
  if (e) e.p += p; else d.set(k, { o: typeof o === "number" ? o : [...o], p });
}
export function distOf(entries: Iterable<readonly [Ordinal, number]>): Dist {
  const d: MutDist = new Map();
  for (const [o, p] of entries) addMass(d, o, p);
  return d;
}
export const pointMass = (o: Ordinal): Dist => distOf([[o, 1]]);
export const totalMass = (d: Dist): number => { let s = 0; for (const e of d.values()) s += e.p; return s; };

/** The law of f(X, Y) for independent X ~ a and Y ~ b. */
export function combine(a: Dist, b: Dist, f: (x: Ordinal, y: Ordinal) => Ordinal): Dist {
  const d: MutDist = new Map();
  for (const x of a.values()) for (const y of b.values()) addMass(d, f(x.o, y.o), x.p * y.p);
  return d;
}
/** The law of f(X) for X ~ a. */
export function mapDist(a: Dist, f: (o: Ordinal) => Ordinal): Dist {
  const d: MutDist = new Map();
  for (const x of a.values()) addMass(d, f(x.o), x.p);
  return d;
}
/** Componentwise sum (scalars add; tuples add component by component). */
export const sumOrdinals = (x: Ordinal, y: Ordinal): Ordinal =>
  typeof x === "number" ? x + (y as number) : x.map((v, i) => v + (y as readonly number[])[i]);
/** The pair (x, y) as a 2-tuple ordinal (lexicographic: x decides, y breaks ties). */
export const pairOrdinal = (x: Ordinal, y: Ordinal): Ordinal => [x as number, y as number];

/** The law of the sum of k independent copies of X ~ a (componentwise for tuples), by repeated squaring. */
export function iidSum(a: Dist, k: number): Dist {
  if (!Number.isInteger(k) || k < 0) throw new Error(`iidSum: k = ${k}`);
  const sample = a.values().next().value;
  if (!sample) throw new Error("iidSum of an empty distribution");
  const zero: Ordinal = typeof sample.o === "number" ? 0 : sample.o.map(() => 0);
  let result: Dist | null = null, pow = a;
  for (let n = k; n > 0; n >>= 1) {
    if (n & 1) result = result ? combine(result, pow, sumOrdinals) : pow;
    if (n > 1) pow = combine(pow, pow, sumOrdinals);
  }
  return result ?? pointMass(zero);
}

/** Total mass a distribution may deviate from 1 by before `survivalLevels` refuses it (mass lost to a bug or underflow). */
export const MASS_TOLERANCE = 1e-9;
/**
 * Exact survival levels of a distribution: [[t, log2 μ{u ≥ t}]] at every ordinal with positive mass, summed from the
 * top so the rare end keeps full relative precision. The first level has log2 G = 0 exactly. Throws unless the total
 * mass is 1 within MASS_TOLERANCE: a distribution that lost mass would make every level wrong.
 */
export function survivalLevels(d: Dist): [Ordinal, number][] {
  const items = [...d.values()].sort((x, y) => cmpOrdinals(x.o, y.o));
  if (!items.length) throw new Error("survivalLevels of an empty distribution");
  const mass = totalMass(d);
  if (Math.abs(mass - 1) > MASS_TOLERANCE) throw new Error(`survivalLevels: the distribution has total mass ${mass}, not 1`);
  const out: [Ordinal, number][] = [];
  let G = 0;
  for (let i = items.length - 1; i >= 0; i--) { G += items[i].p; out.push([items[i].o, Math.log2(Math.min(G, 1))]); }
  out.reverse();
  out[0][1] = 0;
  return out;
}

// --- standard laws ---

const LOG_FACT: number[] = [0];
/** ln n! (tabulated). */
export function logFactorial(n: number): number {
  while (LOG_FACT.length <= n) LOG_FACT.push(LOG_FACT[LOG_FACT.length - 1] + Math.log(LOG_FACT.length));
  return LOG_FACT[n];
}
/** Binomial(n, p). */
export function binomial(n: number, p: number): Dist {
  const d: MutDist = new Map();
  const lp = Math.log(p), lq = Math.log(1 - p);
  for (let k = 0; k <= n; k++) {
    const l = logFactorial(n) - logFactorial(k) - logFactorial(n - k) + (k ? k * lp : 0) + (n - k ? (n - k) * lq : 0);
    addMass(d, k, Math.exp(l));
  }
  return d;
}
/**
 * The law of f(counts) for multinomial counts of n trials over categories with probabilities ps (which may include 0).
 * Enumerates every composition of n into ps.length parts: fine for a row (n ≤ 7) or four corners, not for 49 cells.
 */
export function multinomial(n: number, ps: readonly number[], f: (counts: readonly number[]) => Ordinal): Dist {
  const d: MutDist = new Map(), counts: number[] = new Array(ps.length).fill(0);
  const lps = ps.map(p => (p > 0 ? Math.log(p) : -Infinity));
  const rec = (i: number, left: number, lw: number) => {
    if (i === ps.length - 1) {
      counts[i] = left;
      const l = lw - logFactorial(left) + (left ? left * lps[i] : 0);
      if (l > -Infinity) addMass(d, f(counts), Math.exp(l));
      return;
    }
    for (let c = 0; c <= left; c++) {
      if (c && lps[i] === -Infinity) break;
      counts[i] = c;
      rec(i + 1, left - c, lw - logFactorial(c) + (c ? c * lps[i] : 0));
    }
  };
  rec(0, n, logFactorial(n));
  return d;
}
/**
 * The count accumulated along a line of n iid cells with value law pv (index = value, pv[v] its probability), where
 * each cell adds step(previous value or null, value): the per-row law of Staircase Climber, Rainbow Steps and the like.
 * State = (last value, count so far), so it is O(n · |pv|² · counts).
 */
export function lineChainCount(n: number, pv: readonly number[], step: (previous: number | null, value: number) => number): Dist {
  type St = { last: number | null; c: number; p: number };
  let cur = new Map<string, St>([["", { last: null, c: 0, p: 1 }]]);
  for (let i = 0; i < n; i++) {
    const next = new Map<string, St>();
    for (const s of cur.values()) for (let v = 0; v < pv.length; v++) {
      if (!(pv[v] > 0)) continue;
      const c = s.c + step(s.last, v), k = `${v}|${c}`, e = next.get(k);
      if (e) e.p += s.p * pv[v]; else next.set(k, { last: v, c, p: s.p * pv[v] });
    }
    cur = next;
  }
  const d: MutDist = new Map();
  for (const s of cur.values()) addMass(d, s.c, s.p);
  return d;
}
/**
 * The law of max_i count_i for multinomial(n; 1/k, …, 1/k): μ{max ≥ m} by a dynamic programme over categories with
 * state (cells used, some category already ≥ m), which adds only positive terms (no cancellation deep in the tail).
 */
export function maxOfEqualMultinomial(n: number, k: number): [Ordinal, number][] {
  const out: [Ordinal, number][] = [];
  const lk = Math.log(k), lnFact = logFactorial(n);
  for (let m = Math.ceil(n / k); m <= n; m++) {
    let dp0 = new Float64Array(n + 1), dp1 = new Float64Array(n + 1);
    dp0[0] = 1;
    for (let j = 0; j < k; j++) {
      const n0 = new Float64Array(n + 1), n1 = new Float64Array(n + 1);
      for (let u = 0; u <= n; u++) {
        if (!dp0[u] && !dp1[u]) continue;
        for (let c = 0; u + c <= n; c++) {
          const w = Math.exp(-logFactorial(c));
          if (c >= m) n1[u + c] += (dp0[u] + dp1[u]) * w;
          else { n0[u + c] += dp0[u] * w; n1[u + c] += dp1[u] * w; }
        }
      }
      dp0 = n0; dp1 = n1;
    }
    const P = dp1[n] * Math.exp(lnFact - n * lk);
    if (P > 0) out.push([m, Math.log2(Math.min(1, P))]);
  }
  out[0][1] = 0;
  return out;
}
/**
 * Row-to-row transfer matrix for a count that is a sum of a within-row term h(row) over the N rows and a between-rows
 * term v(row, nextRow) over the N−1 adjacent pairs, rows being iid uniform over M states (e.g. the C^N colourings of
 * a row). Returns the exact law of the count (≤ maxCount). Cost O(N · M² · maxCount): fine up to M ≈ 1500.
 */
export function rowTransferCount(N: number, M: number, h: (row: number) => number, v: (row: number, next: number) => number, maxCount: number): Dist {
  const hs = Array.from({ length: M }, (_, r) => h(r));
  if (hs.some(x => !Number.isInteger(x) || x < 0 || x > maxCount)) throw new Error("rowTransferCount: h(row) outside 0..maxCount");
  let cur: Float64Array[] = Array.from({ length: M }, (_, r) => { const a = new Float64Array(maxCount + 1); a[hs[r]] = 1 / M; return a; });
  for (let step = 1; step < N; step++) {
    const next: Float64Array[] = Array.from({ length: M }, () => new Float64Array(maxCount + 1));
    for (let a = 0; a < M; a++) {
      const pa = cur[a];
      for (let b = 0; b < M; b++) {
        const shift = v(a, b) + hs[b], nb = next[b];
        if (!Number.isInteger(shift) || shift < 0 || shift > maxCount) throw new Error("rowTransferCount: v(row, next) + h(next) outside 0..maxCount");
        for (let c = 0; c + shift <= maxCount; c++) if (pa[c]) nb[c + shift] += pa[c] / M;
      }
    }
    cur = next;
  }
  const d: MutDist = new Map();
  for (const a of cur) for (let c = 0; c <= maxCount; c++) addMass(d, c, a[c]);
  return d;
}
/** P(Poisson(λ) ≥ t), summed from the top. The moderate-tail approximation for counts of rare, weakly dependent patterns. */
export function poissonTail(lambda: number, t: number): number {
  if (!(lambda >= 0)) throw new Error(`poissonTail: λ = ${lambda}`);
  if (lambda === 0) return t <= 0 ? 1 : 0;
  let total = 0;
  const top = Math.ceil(lambda + 60 * Math.sqrt(lambda + 1) + t + 50);
  for (let k = top; k >= Math.max(0, t); k--) total += Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k));
  return Math.min(1, total);
}
/** An exact survival as an `AnalyticSurvival`. */
export const exactSurvival = (id: string, d: Dist): AnalyticSurvival => ({ id, kind: "exact", levels: survivalLevels(d) });
/**
 * An exact survival whose law is computed on first use (and then kept): for formulas costing more than a few
 * milliseconds (a transfer matrix), so that computing a table key (which needs the id only) stays instant.
 */
export function lazySurvival(id: string, law: () => Dist): AnalyticSurvival {
  let levels: AnalyticLevels | undefined;
  return { id, kind: "exact", get levels() { return levels ??= survivalLevels(law()); } };
}
