/**
 * The four lenses of a line and the price of a one-turn route through one (the owner, 17 Nov; v2-core surprise.ts).
 * Every line parameter in a lens is a pair of whole numbers (top, bottom, lowest terms, bottom > 0); a, b, c are whole.
 * A turn pins one lens and lists mutations on its whole numbers: add k, multiply by f, divide exactly by f, negate,
 * swap top and bottom, round (a pair to its nearest whole number). Its cost in bits is the mutations' naming bits plus
 * the turn's surprise over the lens's whole numbers (turnSurprise).
 *
 * The lenses are the game's own (lens-moves.ts), seen through `Lens`; the prices below match its turn law (each
 * mutation's which + where + argument + continue bit, the lens named once a turn, the surprise of the overall change).
 */
import { argBits, universalBits, gcd, q, turnSurprise, type Q } from "@workspace/v2-core";
import { isVertical, type Line } from "./line.ts";
import { LENS_BITS, lenses as gameLenses } from "./lens-moves.ts";

export type LensId = "mc" | "xy" | "abc" | "mA";
/** The estimator's view of a lens (the game's own, lens-moves.ts): numbers of a line, and a line from numbers. */
export interface Lens {
  readonly id: LensId;
  readonly title: string;
  /** The whole numbers' names, in order. */
  readonly names: readonly string[];
  /** Index pairs (top, bottom) of the lens's fractions. */
  readonly pairs: readonly (readonly [number, number])[];
  /** The line's whole numbers in this lens (lowest terms, bottoms > 0), or null when the lens cannot read it. */
  numbers(l: Line): bigint[] | null;
  /** The line these numbers name (prev settles what the lens does not say: the side of the origin in "mA"), or null. */
  line(ns: readonly bigint[], prev: Line): Line | null;
}

const babs = (x: bigint) => (x < 0n ? -x : x);
export const LENSES: readonly Lens[] = gameLenses.map(g => ({
  id: g.id as LensId, title: g.title, names: g.numbers, pairs: g.pairs,
  numbers: l => { if (isVertical(l)) return null; const n = g.read(l); return "invalid" in n ? null : n; },
  line: (ns, prev) => {
    for (const [t, b] of g.pairs) if (ns[b]! <= 0n || gcd(ns[t]!, ns[b]!) !== 1n) {   // the game keeps pairs reduced, bottoms ≥ 1
      if (ns[b]! === 0n) return null;
      const out = ns.slice(), sgn = ns[b]! < 0n ? -1n : 1n, d = gcd(ns[t]!, ns[b]!);
      out[t] = (sgn * ns[t]!) / d; out[b] = (sgn * ns[b]!) / d;
      return LENSES.find(x => x.id === g.id)!.line(out, prev);
    }
    const l = g.build(ns, prev);
    return "invalid" in l || isVertical(l) ? null : l;
  },
}));
export const lensById = (id: LensId): Lens => LENSES.find(l => l.id === id)!;

// ------------------------------------------------------------------ prices

/** The menu: add, multiply, divide, negate, swap, round (lens-moves.ts). */
export const MENU = 6;
/** One mutation's naming bits as the game charges them: which move, which number (or, for swap and round, which pair), its argument, and the continue bit. */
export const mutationBits = (lens: Lens, arg: number, onPair = false): number =>
  Math.log2(MENU) + Math.log2(onPair ? Math.max(1, lens.pairs.length) : lens.names.length) + arg + 1;
/** A factor's bits (multiply, divide: lens-moves.ts uses the Elias code of the factor). */
const factorBits = (f: bigint): number => universalBits(f);
/** The bits naming the turn's lens, paid once a turn. */
export const TURN_BITS = LENS_BITS;
const S = (a: bigint, b: bigint, crossed: boolean) => turnSurprise([a], [b], [crossed]);
const crosses = (a: bigint, b: bigint) => (a < 0n && b > 0n) || (a > 0n && b < 0n);

/** The cheapest single-number path from a to b: naming bits and whether it crosses zero (an add through 0). */
export function numberNaming(lens: Lens, a: bigint, b: bigint): { readonly bits: number; readonly crossed: boolean } {
  if (a === b) return { bits: 0, crossed: false };
  const neg = mutationBits(lens, 0);
  if (b === -a) return { bits: neg, crossed: false };
  let bits = mutationBits(lens, argBits(b - a, true)), crossed = crosses(a, b);
  // Across zero: negate first, then add (no crossing, so no long path's surprise), when that is the cheaper whole.
  if (crossed) { const nb = neg + mutationBits(lens, argBits(b + a, true)); if (nb + S(a, b, false) < bits + S(a, b, true)) { bits = nb; crossed = false; } }
  const scale = (big: bigint, small: bigint) => {   // big = small·f
    if (small === 0n || big % small !== 0n) return;
    const f = big / small, fb = mutationBits(lens, babs(f) >= 2n ? factorBits(babs(f)) : 0) + (f < 0n ? neg : 0);
    if (babs(f) >= 2n && fb + S(a, b, false) < bits + S(a, b, crossed)) { bits = fb; crossed = false; }
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
    const op = mutationBits(lens, 0, true);
    // Before the per-number mutations: nothing, a swap (top and bottom, the sign kept on top) or a round.
    const pre: [number, bigint, bigint][] = [[0, x0, x1]];
    if (x0 !== 0n) pre.push([op, x0 < 0n ? -x1 : x1, babs(x0)]);
    if (x1 !== 1n) pre.push([op, roundHalf(x0, x1), 1n]);
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
/** t/b rounded as the game rounds (floor(t/b + ½)). */
export const roundHalf = (t: bigint, b: bigint): bigint => { const num = 2n * t + b, den = 2n * b; return num >= 0n ? num / den : -((-num + den - 1n) / den); };
export const roundHalfAway = (v: Q): bigint => roundHalf(v.n, v.d);

/** The cheapest one-turn route from x onto t over the lenses: its lens, naming and surprise (Infinity when none names t). */
export function routePrice(x: Line, t: Line, lenses: readonly Lens[] = LENSES): { readonly lens: LensId | null; readonly naming: number; readonly surprise: number; readonly total: number } {
  let out: { lens: LensId | null; naming: number; surprise: number; total: number } = { lens: null, naming: Infinity, surprise: Infinity, total: Infinity };
  if (x.a === t.a && x.b === t.b && x.c === t.c) return { lens: null, naming: 0, surprise: 0, total: 0 };
  for (const lens of lenses) {
    const xs = lens.numbers(x), ts = lens.numbers(t);
    if (!xs || !ts) continue;
    const back = lens.line(ts, x);
    if (!back || back.a !== t.a || back.b !== t.b || back.c !== t.c) continue;
    const p = lensPrice(lens, xs, ts), total = p.naming + TURN_BITS + p.surprise;
    if (total < out.total) out = { lens: lens.id, naming: p.naming + TURN_BITS, surprise: p.surprise, total };
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
      if (n !== 0n) yield* emit(set(i, n * f), mutationBits(lens, factorBits(f)));
      if (n % f === 0n && n !== 0n) yield* emit(set(i, n / f), mutationBits(lens, factorBits(f)));
    }
    if (!bottoms.has(i) && n !== 0n) yield* emit(set(i, -n), mutationBits(lens, 0));
  }
  for (const [t, b] of lens.pairs) {
    const op = mutationBits(lens, 0, true);
    if (xs[t] !== 0n) { const ns = xs.slice(); ns[t] = xs[t]! < 0n ? -xs[b]! : xs[b]!; ns[b] = babs(xs[t]!); yield* emit(ns, op); }
    if (xs[b] !== 1n) { const ns = xs.slice(); ns[t] = roundHalf(xs[t]!, xs[b]!); ns[b] = 1n; yield* emit(ns, op); }
  }
}

/** The lens's surprise from x's numbers to z's (each crossing of zero as an add's), with the bits naming the lens. */
export function lensSurprise(xs: readonly bigint[], zs: readonly bigint[]): number {
  return turnSurprise(xs, zs, xs.map((a, i) => crosses(a, zs[i]!))) + TURN_BITS;
}
