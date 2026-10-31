/**
 * Exact survival functions for Int families: x uniform on [min, max] (derivations: docs/analytic-calibration/
 * solutions.md §Int).
 *
 * Tools: exact integer COUNTS (never probabilities until the end, so differences of counts are exact):
 *  - digit automata over an interval (`digitCounts`): a finite automaton reads the base-b digits most significant
 *    first; counting y ∈ [0, B] is a digit DP with a "still equal to B's prefix" flag, memoised on the free suffix;
 *  - residue classes: anything that depends on x mod L is counted over one period with floor arithmetic;
 *  - two's-complement bits: for the full Int32 range every bit pattern appears once, so bits are iid fair coins.
 */
import type { Instantiation } from "@workspace/game-types";
import type { Params } from "../types.ts";
import { levels, type Dist, type Levels, type Vec } from "./kit.ts";

/** outcome key → [outcome, count] */
type Counts = Map<string, { v: Vec; c: number }>;
const addC = (m: Counts, v: Vec, c: number) => {
  if (c === 0) return;
  const k = v.join(","), e = m.get(k);
  if (e) e.c += c; else m.set(k, { v: v.map(x => x + 0), c }); // −0 → 0
};
const mergeInto = (into: Counts, from: Counts, sign = 1) => { for (const e of from.values()) addC(into, e.v, sign * e.c); };

export interface Automaton<S> {
  readonly start: S;
  step(s: S, digit: number): S;
  out(s: S): Vec;
  key(s: S): string;
}

/**
 * Counts of out(state) over y ∈ [0, B] (B ≥ −1), y written in `base` most significant digit first: with `width`
 * the representation is padded to exactly `width` digits; without it there are no leading zeros and 0 reads "0".
 */
export function digitCounts<S>(B: number, base: number, A: Automaton<S>, width?: number): Counts {
  const out: Counts = new Map();
  if (B < 0) return out;
  const D: number[] = [];
  for (let y = B; y > 0; y = Math.floor(y / base)) D.unshift(y % base);
  if (!D.length) D.push(0);
  if (width !== undefined) { while (D.length < width) D.unshift(0); if (D.length > width) throw new Error("B wider than width"); }
  const L = D.length, fixed = width !== undefined;
  const memo = new Map<string, Counts>();
  // Counts over all completions of positions pos.. with no upper bound.
  const free = (pos: number, s: S, started: boolean): Counts => {
    const mk = `${pos}|${started ? 1 : 0}|${A.key(s)}`;
    let r = memo.get(mk);
    if (r) return r;
    r = new Map();
    if (pos === L) addC(r, A.out(started || fixed ? s : A.step(s, 0)), 1);
    else for (let d = 0; d < base; d++) {
      const st: boolean = started || fixed || d > 0;
      mergeInto(r, free(pos + 1, st ? A.step(s, d) : s, st));
    }
    memo.set(mk, r);
    return r;
  };
  // Walk B's own digits: at each position take every smaller digit freely, then follow B's digit.
  let s = A.start, started = false;
  for (let pos = 0; pos < L; pos++) {
    for (let d = 0; d < D[pos]; d++) {
      const st: boolean = started || fixed || d > 0;
      mergeInto(out, free(pos + 1, st ? A.step(s, d) : s, st));
    }
    const st: boolean = started || fixed || D[pos] > 0;
    if (st) s = A.step(s, D[pos]);
    started = st;
  }
  addC(out, A.out(started || fixed ? s : A.step(s, 0)), 1);
  return out;
}

/** Counts over y ∈ [a, b] (exact integer differences). */
function intervalCounts(a: number, b: number, f: (B: number) => Counts): Counts {
  const r: Counts = new Map();
  if (b < a) return r;
  mergeInto(r, f(b));
  if (a > 0) mergeInto(r, f(a - 1), -1);
  for (const [k, e] of r) if (e.c === 0) r.delete(k);
  return r;
}

/** Counts of an automaton over the decimal digits of |x|, x ∈ [min, max] (the prelude's `digits(x)`). */
function absDigitCounts<S>(min: number, max: number, A: Automaton<S>, base = 10): Counts {
  const f = (B: number) => digitCounts(B, base, A);
  const r: Counts = new Map();
  if (max >= 0) mergeInto(r, intervalCounts(Math.max(min, 0), max, f));
  if (min < 0) mergeInto(r, intervalCounts(Math.max(1, -max), -min, f));
  return r;
}

/** Counts of an automaton over the 32 two's-complement bits of x (bit 31 first), x ∈ [min, max]. */
function bitCounts<S>(min: number, max: number, A: Automaton<S>): Counts {
  const f = (B: number) => digitCounts(B, 2, A, 32);
  const r: Counts = new Map(), T = 2 ** 32;
  if (max >= 0) mergeInto(r, intervalCounts(Math.max(min, 0), max, f));
  if (min < 0) mergeInto(r, intervalCounts(min + T, Math.min(max, -1) + T, f));
  return r;
}

const toDist = (c: Counts, span: number): Dist => {
  const d: Dist = new Map();
  for (const [k, e] of c) d.set(k, { v: e.v, p: e.c / span });
  return d;
};

/** Multiples of m in [a, b]. */
const multiples = (a: number, b: number, m: number) => (b < a ? 0 : Math.floor(b / m) - Math.floor((a - 1) / m));
/** Nonzero multiples of m in [a, b]. */
const nonzeroMultiples = (a: number, b: number, m: number) => multiples(a, b, m) - (a <= 0 && b >= 0 ? 1 : 0);

// ------------------------------------------------------------------------------------------------
// automata
// ------------------------------------------------------------------------------------------------

const auto = <S>(start: S, step: (s: S, d: number) => S, out: (s: S) => Vec): Automaton<S> =>
  ({ start, step, out, key: s => JSON.stringify(s) });

type Solver = (p: any, min: number, max: number) => Counts;

const SOLVERS: Readonly<Record<string, Solver>> = {
  "digit-devotee": (p, a, b) => absDigitCounts(a, b, auto(0, (n, d) => n + (d === p.d ? 1 : 0), n => [n])),
  /** [matched, alive]: the head is matched while every digit so far agrees. */
  firstborn: (p, a, b) => {
    const H = String(p.head).split("").map(Number);
    return absDigitCounts(a, b, auto([0, 1], ([m, alive], d) => (alive && m < H.length && d === H[m] ? [m + 1, 1] : [m, 0]), ([m]) => [m]));
  },
  /** [sum]: −|digit sum − total|. */
  numerologist: (p, a, b) => absDigitCounts(a, b, auto(0, (s, d) => s + d, s => [-Math.abs(s - p.total)])),
  /** [last, run, best]: the longest run of digits stepping by `step`. */
  stairwalker: (p, a, b) => absDigitCounts(a, b, auto([-99, 0, 1], ([last, run, best], d) => {
    const r = run === 0 ? 1 : d - last === p.step ? run + 1 : 1;
    return [d, r, Math.max(best, r)];
  }, ([, , best]) => [best])),
  /** [head digits…, pos, repeats, alive]: ds[P + i] = ds[i] from the start. */
  refrain: (p, a, b) => {
    const P = p.period;
    // Once a comparison fails nothing changes: dead states forget the head (canonical form keeps the memo small).
    return absDigitCounts(a, b, {
      start: { head: [] as number[], rep: 0, alive: 1, pos: 0 },
      step: (s, d) => {
        if (!s.alive) return s;
        if (s.pos < P) return { head: [...s.head, d], rep: 0, alive: 1, pos: s.pos + 1 };
        // index pos compares with pos − P, which (all repeats having held so far) equals head[(pos − P) mod P]
        return d === s.head[(s.pos - P) % P] ? { head: s.head, rep: s.rep + 1, alive: 1, pos: s.pos + 1 } : { head: [], rep: s.rep, alive: 0, pos: 0 };
      },
      out: s => [s.rep],
      key: s => `${s.alive}|${s.rep}|${s.pos}|${s.head.join("")}`,
    });
  },
  /** Two's-complement bits: hits on the sigil's fixed positions. */
  "bit-sigil": (p, a, b) => {
    const sig = String(p.sigil);
    return bitCounts(a, b, auto({ i: 0, h: 0 }, (s, bit) => ({ i: s.i + 1, h: s.h + (sig[s.i] !== "." && Number(sig[s.i]) === bit ? 1 : 0) }), s => [s.h]));
  },
  /** Longest run of alternating bits over bits 31..0. */
  zebra: (_p, a, b) => bitCounts(a, b, auto([-1, 0, 1], ([last, run, best], bit) => {
    const r = last < 0 ? 1 : bit !== last ? run + 1 : 1;
    return [bit, r, Math.max(best, r)];
  }, ([, , best]) => [best])),
  /** v_p(x) for x ≠ 0 (0 scores 0): #{v_p ≥ k} = nonzero multiples of p^k. */
  "power-hoarder": (p, a, b) => {
    const r: Counts = new Map(), top = Math.max(Math.abs(a), Math.abs(b));
    let prev = b - a + 1;
    for (let k = 1; prev > 0; k++) {
      const m = p.p ** k, atLeast = m <= top ? nonzeroMultiples(a, b, m) : 0;
      addC(r, [k - 1], prev - atLeast);
      prev = atLeast;
    }
    return r;
  },
  /**
   * The S-smooth part s(x) = Π_{p∈S} p^{v_p(x)} (x = 0 scores 1). For each smooth s:
   * #{x ≠ 0 : s(x) = s} = Σ_{T ⊆ S} (−1)^{|T|} · #{x ≠ 0 : s·Π T | x}.
   */
  "smooth-operator": (p, a, b) => {
    const P: number[] = p.primes, top = Math.max(Math.abs(a), Math.abs(b)), r: Counts = new Map();
    const smooth: number[] = [];
    const gen = (i: number, s: number) => {
      if (i === P.length) { smooth.push(s); return; }
      for (let t = s; t <= top; t *= P[i]) gen(i + 1, t);
    };
    gen(0, 1);
    for (const s of smooth) {
      let c = 0;
      for (let mask = 0; mask < 1 << P.length; mask++) {
        let m = s, sign = 1;
        for (let i = 0; i < P.length; i++) if (mask >> i & 1) { m *= P[i]; sign = -sign; }
        if (m <= top) c += sign * nonzeroMultiples(a, b, m);
      }
      addC(r, [s], c);
    }
    if (a <= 0 && b >= 0) addC(r, [1], 1);
    return r;
  },
  /** hits depends on x mod L (L = Π m): count each residue class over the range. */
  "residue-oracle": (p, a, b) => {
    const om: [number, number][] = p.omens, L = om.reduce((x, [m]) => x * m, 1), span = b - a + 1;
    const q = Math.floor(span / L), rem = span % L, start = ((a % L) + L) % L;
    const cnt = new Float64Array(om.length + 1);
    for (let r = 0; r < L; r++) {
      let h = 0;
      for (const [m, want] of om) if (r % m === want) h++;
      const inWindow = ((r - start + L) % L) < rem ? 1 : 0;
      cnt[h] += q + inWindow;
    }
    const out: Counts = new Map();
    cnt.forEach((c, h) => addC(out, [h], c));
    return out;
  },
  /** Last k digits equal the tail's last k (and x has ≥ k digits): a residue class mod 10^k. */
  tailwright: (p, a, b) => {
    const T = String(p.tail), r: Counts = new Map(), span = b - a + 1;
    const absCount = (lo: number, k: number) => { // #{x ∈ [a,b] : |x| ≥ lo, |x| ≡ tail_k mod 10^k}
      const m = 10 ** k, res = Number(T.slice(T.length - k));
      const inAbs = (x: number, y: number) => (y < x ? 0 : Math.floor((y - res) / m) - Math.floor((x - 1 - res) / m));
      let c = 0;
      if (b >= 0) c += inAbs(Math.max(a, 0, lo), b);
      if (a < 0) c += inAbs(Math.max(1, -b, lo), -a);
      return c;
    };
    let prev = span;
    for (let k = 1; k <= T.length; k++) {
      const atLeast = absCount(k === 1 ? 0 : 10 ** (k - 1), k);
      addC(r, [k - 1], prev - atLeast);
      prev = atLeast;
    }
    addC(r, [T.length], prev);
    return r;
  },
  /**
   * Palindromist (base b): pairs = matching outer digit pairs of |x| in base b, stopping at the first mismatch.
   * For each length ℓ, #{first k pairs match} = Σ over the k high digits h: (# of middles making the number ≤ B).
   */
  palindromist: (p, a, b) => {
    const base = p.base;
    const f = (B: number): Counts => palCounts(B, base);
    const r: Counts = new Map();
    if (b >= 0) mergeInto(r, intervalCounts(Math.max(a, 0), b, f));
    if (a < 0) mergeInto(r, intervalCounts(Math.max(1, -b), -a, f));
    return r;
  },
};

/** Counts of the palindromist ordinal over y ∈ [0, B]. */
function palCounts(B: number, base: number): Counts {
  const r: Counts = new Map();
  if (B < 0) return r;
  const D: number[] = [];
  for (let y = B; y > 0; y = Math.floor(y / base)) D.unshift(y % base);
  addC(r, [0], 1); // y = 0: no digits, 0 pairs
  for (let len = 1; len <= D.length; len++) {
    const half = Math.floor(len / 2);
    // atLeast[k] = #{len-digit y ≤ B (no leading zero) whose first k outer pairs match}
    const atLeast: number[] = [];
    for (let k = 0; k <= half; k++) atLeast.push(countPairs(len, k, base, len < D.length ? null : D));
    for (let k = 0; k <= half; k++) addC(r, [k], atLeast[k] - (k < half ? atLeast[k + 1] : 0));
  }
  return r;
}

/** # of len-digit base-b numbers (leading digit ≠ 0), ≤ the digit string D when given, with d_i = d_{len−1−i} for i < k. */
function countPairs(len: number, k: number, base: number, D: number[] | null): number {
  const mid = len - 2 * k;
  // Unbounded: the k high digits (leading ≠ 0) fix their mirrors, the middle is free.
  if (!D) return k === 0 ? (base - 1) * base ** (len - 1) : (base - 1) * base ** (k - 1) * base ** mid;
  // Enumerate the k high digits h (h_0 ≠ 0); the low k digits are their mirror; the middle is free.
  let total = 0;
  const h: number[] = [];
  const rec = (i: number) => {
    if (i === k) {
      // compare prefix with D[0..k)
      let c = 0;
      for (let j = 0; j < k; j++) { if (h[j] !== D[j]) { c = h[j] < D[j] ? -1 : 1; break; } }
      if (c < 0) { total += base ** mid; return; }
      if (c > 0) return;
      // prefix equal: count middles m (mid digits) with (m, mirror) ≤ (D_mid, D_suf)
      let midVal = 0;
      for (let j = k; j < k + mid; j++) midVal = midVal * base + D[j];
      const suffix = h.slice().reverse();
      let sc = 0;
      for (let j = 0; j < k; j++) { if (suffix[j] !== D[k + mid + j]) { sc = suffix[j] < D[k + mid + j] ? -1 : 1; break; } }
      if (k === 0) { // no pairs: count len-digit numbers ≤ D with leading digit ≠ 0
        let v = 0;
        for (const d of D) v = v * base + d;
        total += v - base ** (len - 1) + 1;
        return;
      }
      total += midVal + (sc <= 0 ? 1 : 0);
      return;
    }
    for (let d = i === 0 ? 1 : 0; d < base; d++) { h.push(d); rec(i + 1); h.pop(); }
  };
  rec(0);
  return total;
}

export function intLevels(familyId: string, params: Params, inst: Instantiation): Levels | null {
  const s = SOLVERS[familyId];
  if (!s) return null;
  const min = Number(inst.args.min), max = Number(inst.args.max);
  return levels(toDist(s(params, min, max), max - min + 1));
}

export const INT_SOLVED: readonly string[] = Object.keys(SOLVERS);
