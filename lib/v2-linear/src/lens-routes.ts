/**
 * The four lenses of a line and the price of a one-turn route through one (the owner, 17 Nov; v2-core surprise.ts).
 * Every line parameter in a lens is a pair of whole numbers (top, bottom, lowest terms, bottom > 0); a, b, c are whole.
 * A turn pins one lens and lists mutations on its whole numbers: add k, multiply by f, divide exactly by f, negate,
 * swap top and bottom, round (a pair to its nearest whole number). Its cost in bits is the mutations' naming bits plus
 * the turn's surprise over the lens's whole numbers (turnSurprise).
 *
 * The estimator needs only `Lens` (numbers of a line, a line from numbers) and the prices below; when the game's own
 * lenses land (session A's lib/v2-linear lenses) this file's lenses are the one thing to swap.
 */
import { argBits, namingBits, q, Qn, turnSurprise, type Q } from "@workspace/v2-core";
import { fromMC, isVertical, normalise, type Line } from "./line.ts";

export type LensId = "mc" | "xc" | "abc" | "ma";
export interface Lens {
  readonly id: LensId;
  readonly title: string;
  /** The whole numbers' names, in order. */
  readonly names: readonly string[];
  /** Index pairs (top, bottom) of the lens's fractions. */
  readonly pairs: readonly (readonly [number, number])[];
  /** The line's whole numbers in this lens (lowest terms, bottoms > 0), or null when the lens cannot read it. */
  numbers(l: Line): bigint[] | null;
  /** The line these numbers name (prev settles what the lens does not say: the sign of c in "ma"), or null. */
  line(ns: readonly bigint[], prev: Line): Line | null;
}

const babs = (x: bigint) => (x < 0n ? -x : x);
const mOf = (l: Line): Q => q(-l.a, l.b), cOf = (l: Line): Q => q(-l.c, l.b);
const frac = (t: bigint, b: bigint): Q | null => (b === 0n ? null : q(t, b));
function isqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x * x === n ? x : null;
}

export const LENSES: readonly Lens[] = [
  {
    id: "mc", title: "gradient and y-intercept", names: ["m top", "m bottom", "c top", "c bottom"], pairs: [[0, 1], [2, 3]],
    numbers: l => (isVertical(l) ? null : [mOf(l).n, mOf(l).d, cOf(l).n, cOf(l).d]),
    line: ns => { const m = frac(ns[0]!, ns[1]!), c = frac(ns[2]!, ns[3]!); return m && c ? fromMC(m, c) : null; },
  },
  {
    id: "xc", title: "x- and y-intercepts", names: ["X top", "X bottom", "c top", "c bottom"], pairs: [[0, 1], [2, 3]],
    numbers: l => {
      if (isVertical(l) || l.a === 0n) return null;
      const X = q(-l.c, l.a), c = cOf(l);
      return [X.n, X.d, c.n, c.d];
    },
    line: (ns, prev) => {
      const X = frac(ns[0]!, ns[1]!), c = frac(ns[2]!, ns[3]!);
      if (!X || !c) return null;
      if (Qn.isZero(X)) return Qn.isZero(c) && !isVertical(prev) && prev.a !== 0n ? fromMC(mOf(prev), q(0)) : null;
      return fromMC(Qn.neg(Qn.div(c, X)), c);
    },
  },
  {
    id: "abc", title: "a, b, c", names: ["a", "b", "c"], pairs: [],
    numbers: l => (isVertical(l) ? null : [l.a, l.b, l.c]),
    line: ns => { const l = normalise(ns[0]!, ns[1]!, ns[2]!); return "invalid" in l || isVertical(l) ? null : l; },
  },
  {
    id: "ma", title: "gradient and signed area", names: ["m top", "m bottom", "area top", "area bottom"], pairs: [[0, 1], [2, 3]],
    numbers: l => {
      if (isVertical(l) || l.a === 0n) return null;
      const m = mOf(l), c = cOf(l), A = Qn.div(Qn.neg(Qn.mul(c, c)), Qn.mul(q(2), m));
      return [m.n, m.d, A.n, A.d];
    },
    line: (ns, prev) => {
      const m = frac(ns[0]!, ns[1]!), A = frac(ns[2]!, ns[3]!);
      if (!m || !A || Qn.isZero(m)) return null;
      const c2 = Qn.mul(Qn.mul(q(-2), m), A), tn = isqrt(c2.n), td = isqrt(c2.d);   // c² = −2mA
      if (tn === null || td === null) return null;
      const neg = !isVertical(prev) && cOf(prev).n < 0n;
      return fromMC(m, q(neg ? -tn : tn, td));
    },
  },
];
export const lensById = (id: LensId): Lens => LENSES.find(l => l.id === id)!;

// ------------------------------------------------------------------ prices

/** The menu: add, multiply, divide, negate, swap, round. */
export const MENU = 6;
export const mutationBits = (lens: Lens, arg: number): number => namingBits({ menuSize: MENU, lensSize: lens.names.length, argBits: arg });
const S = (a: bigint, b: bigint, crossed: boolean) => turnSurprise([a], [b], [crossed]);
const crosses = (a: bigint, b: bigint) => (a < 0n && b > 0n) || (a > 0n && b < 0n);

/** The cheapest single-number path from a to b: naming bits and whether it crosses zero (an add through 0). */
export function numberNaming(lens: Lens, a: bigint, b: bigint): { readonly bits: number; readonly crossed: boolean } {
  if (a === b) return { bits: 0, crossed: false };
  const neg = mutationBits(lens, 0);
  if (b === -a) return { bits: neg, crossed: false };
  let bits = mutationBits(lens, argBits(b - a, true)), crossed = crosses(a, b);
  // Across zero: negate first, then add (no crossing, so no long path's surprise).
  if (crossed) { const nb = neg + mutationBits(lens, argBits(b + a, true)); if (nb < Infinity) { bits = nb; crossed = false; } }
  const scale = (big: bigint, small: bigint) => {   // big = small·f
    if (small === 0n || big % small !== 0n) return;
    const f = big / small, fb = mutationBits(lens, argBits(babs(f), false)) + (f < 0n ? neg : 0);
    if (babs(f) >= 2n && fb < bits) { bits = fb; crossed = false; }
  };
  scale(b, a);   // multiply a by f
  scale(a, b);   // divide a by f
  return { bits, crossed };
}

/** A turn's price in one lens from numbers xs to ts: naming (cheapest list) and surprise. */
export function lensPrice(lens: Lens, xs: readonly bigint[], ts: readonly bigint[]): { readonly naming: number; readonly surprise: number } {
  const n = xs.length, inPair = new Set(lens.pairs.flat());
  let naming = 0, surprise = 0;
  for (let i = 0; i < n; i++) if (!inPair.has(i)) { const p = numberNaming(lens, xs[i]!, ts[i]!); naming += p.bits; surprise += S(xs[i]!, ts[i]!, p.crossed); }
  for (const [t, b] of lens.pairs) {
    const [x0, x1, t0, t1] = [xs[t]!, xs[b]!, ts[t]!, ts[b]!];
    const op = mutationBits(lens, 0);
    // Before the per-number mutations: nothing, a swap (top and bottom, the sign kept on top) or a round.
    const pre: [number, bigint, bigint][] = [[0, x0, x1]];
    if (x0 !== 0n) pre.push([op, x0 < 0n ? -x1 : x1, babs(x0)]);
    if (x1 !== 1n) { const r = q(x0, x1), w = roundHalfAway(r); pre.push([op, w, 1n]); }
    // The target as written, or scaled by k so that one of x's numbers stays (25/4 → 26/4 names 13/2 in one add).
    const aims: [bigint, bigint][] = [[t0, t1]];
    if (t1 !== 0n && x1 % t1 === 0n && x1 !== t1) aims.push([t0 * (x1 / t1), x1]);
    if (t0 !== 0n && x0 % t0 === 0n && x0 !== t0 && (x0 / t0) > 0n) aims.push([x0, t1 * (x0 / t0)]);
    let best = Infinity, bestS = 0;
    for (const [c, y0, y1] of pre) for (const [a0, a1] of aims) {
      const p0 = numberNaming(lens, y0, a0), p1 = numberNaming(lens, y1, a1), total = c + p0.bits + p1.bits;
      const s = S(x0, t0, p0.crossed) + S(x1, t1, p1.crossed);
      if (total + s < best + bestS) { best = total; bestS = s; }
    }
    naming += best; surprise += bestS;
  }
  return { naming, surprise };
}
export const roundHalfAway = (v: Q): bigint => { const t = babs(v.n), w = (2n * t + v.d) / (2n * v.d); return v.n < 0n ? -w : w; };

/** The cheapest one-turn route from x onto t over the lenses: its lens, naming and surprise (Infinity when none names t). */
export function routePrice(x: Line, t: Line, lenses: readonly Lens[] = LENSES): { readonly lens: LensId | null; readonly naming: number; readonly surprise: number; readonly total: number } {
  let out: { lens: LensId | null; naming: number; surprise: number; total: number } = { lens: null, naming: Infinity, surprise: Infinity, total: Infinity };
  if (x.a === t.a && x.b === t.b && x.c === t.c) return { lens: null, naming: 0, surprise: 0, total: 0 };
  for (const lens of lenses) {
    const xs = lens.numbers(x), ts = lens.numbers(t);
    if (!xs || !ts) continue;
    const back = lens.line(ts, x);
    if (!back || back.a !== t.a || back.b !== t.b || back.c !== t.c) continue;
    const p = lensPrice(lens, xs, ts), total = p.naming + p.surprise;
    if (total < out.total) out = { lens: lens.id, naming: p.naming, surprise: p.surprise, total };
  }
  return out;
}

// ------------------------------------------------------------------ the single mutations of a lens (the climb's moves)

/** Every single mutation on x's lens numbers worth trying in a climb, each with its naming bits and the line it names. */
export function* lensMoves(lens: Lens, x: Line, xs: readonly bigint[]): Generator<{ readonly to: Line; readonly bits: number }> {
  const emit = function* (ns: bigint[], bits: number) { const l = lens.line(ns, x); if (l) yield { to: l, bits }; };
  const set = (i: number, v: bigint) => { const ns = xs.slice(); ns[i] = v; return ns; };
  const bottoms = new Set(lens.pairs.map(p => p[1]));
  for (let i = 0; i < xs.length; i++) {
    const n = xs[i]!, L = babs(n).toString(2).length;
    // Amounts: ±1, ±2 and ±4^j up to about twice the number (a climb's steps from fine to coarse).
    const ks: bigint[] = [1n, 2n];
    for (let j = 2; j <= L + 1; j += 2) ks.push(1n << BigInt(j));
    for (const k of ks) for (const kk of [k, -k]) {
      const v = n + kk;
      if (bottoms.has(i) && v <= 0n) continue;
      yield* emit(set(i, v), mutationBits(lens, argBits(kk, true)));
    }
    for (const f of [2n, 3n, 10n]) {
      if (n !== 0n) yield* emit(set(i, n * f), mutationBits(lens, argBits(f, false)));
      if (n % f === 0n && n !== 0n) yield* emit(set(i, n / f), mutationBits(lens, argBits(f, false)));
    }
    if (!bottoms.has(i) && n !== 0n) yield* emit(set(i, -n), mutationBits(lens, 0));
  }
  for (const [t, b] of lens.pairs) {
    const op = mutationBits(lens, 0);
    if (xs[t] !== 0n) { const ns = xs.slice(); ns[t] = xs[t]! < 0n ? -xs[b]! : xs[b]!; ns[b] = babs(xs[t]!); yield* emit(ns, op); }
    if (xs[b] !== 1n) { const ns = xs.slice(); ns[t] = roundHalfAway(q(xs[t]!, xs[b]!)); ns[b] = 1n; yield* emit(ns, op); }
  }
}

/** The lens's surprise from x's numbers to z's (each crossing of zero as an add's). */
export function lensSurprise(xs: readonly bigint[], zs: readonly bigint[]): number {
  return turnSurprise(xs, zs, xs.map((a, i) => crosses(a, zs[i]!)));
}
