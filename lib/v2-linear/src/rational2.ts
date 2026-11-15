/**
 * The rational pool's new families (docs/engine-v2/line-rules-v3-proposals.md §A2, with the tied secondaries of its
 * table; dealt parameters as in the run: x = 3/2, T = 5/3, the point (2, 7/3)) and Smooth Crossing, an adversary for
 * owner decision 30 (smooth numbers against big primes). Like rational.ts: on the line type, in no pool (undealt until
 * they pass the collapse check, §A5), dealable only on rational lines. Every layer is a distance, a count or a size
 * (decisions 13 and 23); every tie-breaker is a relation between the main layer's anchor and another aspect of the line
 * (decision 29). The §A2 cards the proposal finds worthless or degenerate (whole-at-n, mediant-mid) are left out.
 *
 * Parameters are rationals in wire form ("5/3"), so they hash and print exactly.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, gap, more, num, undef, type Shape } from "./layers.ts";
import { nearestInteger, nearestSquareRoot, primeFactorCount } from "./numbers.ts";
import { gcdTerm, onRationals } from "./rational.ts";

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const P = (s: string): Q => Qn.parse(s);

// ---------------------------------------------------------------- Whole Area

const areaShape: Shape<object> = {
  main: distance("area", "the triangle's area close to a whole number",
    "The triangle the line makes with the two axes should have an area as close as possible to a whole number.", "tri"),
  tieBreakers: [
    more("gcd-x", "common factor of that whole number and the x-intercept's nearest whole number",
      "That whole number and the whole number nearest where the line crosses the x-axis should have as big a common factor as possible.", "tri"),
    more("gcd-den-m", "common factor of that whole number and the gradient's bottom",
      "That whole number and the gradient's bottom number (in lowest terms) should have as big a common factor as possible.", "tri"),
  ],
};
export const wholeArea = family("whole-area", "Whole Area", ["tri", "crossing", "si"], areaShape, onRationals([{}]), ctx => {
  const aRef = ref("tri", "area");
  const av = ctx.read(aRef), A = num(av);
  if (A === null) return allUndefined(ctx, areaShape, av, aRef);   // through the origin, or parallel to an axis: no triangle
  const xRef = ref("crossing", "x0"), mRef = ref("si", "m");
  const X = num(ctx.read(xRef))!, m = num(ctx.read(mRef))!;   // a triangle needs a slanted line: both exist
  const K = nearestInteger(A);
  ctx.term("area", `distance from the area ${Qn.toWire(A)} to ${K}`, gap(A, q(K)), [aRef]);
  const gx = gcdTerm(K, nearestInteger(X), `common factor of ${K} and ${nearestInteger(X)} (nearest the x-intercept)`);
  ctx.term("gcd-x", gx.label, gx.value, [aRef, xRef]);
  const gq = gcdTerm(K, m.d, `common factor of ${K} and the gradient's bottom ${m.d}`);
  ctx.term("gcd-den-m", gq.label, gq.value, [aRef, mRef]);
  ctx.mark({ kind: "focus", ref: aRef });
  ctx.mark({ kind: "note", ref: aRef, text: `area ${Qn.toWire(A)}, nearest whole number ${K}` });
});

// ---------------------------------------------------------------- Whole at x = T

export type WholeAtParams = { T: string };
const atShape: Shape<WholeAtParams> = {
  main: { ...distance<WholeAtParams>("whole", "y at the dealt x close to a whole number", "", "si"),
    sentence: p => `When x is ${p.T}, y should be as close as possible to a whole number.` },
  tieBreakers: [
    more("gcd-c", "common factor of that whole number and the y-intercept's nearest whole number",
      "That whole number and the whole number nearest the y-intercept should have as big a common factor as possible.", "si"),
    more("gcd-den-m", "common factor of that whole number and the gradient's bottom",
      "That whole number and the gradient's bottom number (in lowest terms) should have as big a common factor as possible.", "si"),
  ],
};
export const wholeAtT = family<WholeAtParams>("whole-at-t", "Whole at x = T", ["si"], atShape, onRationals([{ T: "3/2" }]), (ctx, p) => {
  const yRef = ref("si", "y", { q: P(p.T) });
  const yv = ctx.read(yRef), y = num(yv);
  if (y === null) return allUndefined(ctx, atShape, yv, yRef);   // vertical
  const cRef = ref("si", "c"), mRef = ref("si", "m");
  const c = num(ctx.read(cRef))!, m = num(ctx.read(mRef))!;
  const Y = nearestInteger(y);
  ctx.term("whole", `distance from y(${p.T}) = ${Qn.toWire(y)} to ${Y}`, gap(y, q(Y)), [yRef]);
  const gc = gcdTerm(Y, nearestInteger(c), `common factor of ${Y} and ${nearestInteger(c)} (nearest the y-intercept)`);
  ctx.term("gcd-c", gc.label, gc.value, [yRef, cRef]);
  const gq = gcdTerm(Y, m.d, `common factor of ${Y} and the gradient's bottom ${m.d}`);
  ctx.term("gcd-den-m", gq.label, gq.value, [yRef, mRef]);
  ctx.mark({ kind: "focus", ref: yRef });
});

// ---------------------------------------------------------------- Target Gradient

export type TargetParams = { T: string };
const targetShape: Shape<TargetParams> = {
  main: { ...distance<TargetParams>("target", "the gradient close to T", "", "si"),
    sentence: p => `The gradient should be as close as possible to ${p.T}.` },
  tieBreakers: [
    more("gcd-tops", "common factor of the gradient's and the y-intercept's tops",
      "Writing the gradient and the y-intercept as fractions in lowest terms, their top numbers should have as big a common factor as possible.", "si"),
    more("same-den", "common factor of the gradient's and the y-intercept's bottoms",
      "Writing the gradient and the y-intercept as fractions in lowest terms, their bottom numbers should have as big a common factor as possible.", "si"),
  ],
};
export const targetGradient = family<TargetParams>("target-gradient", "Target Gradient", ["si"], targetShape, onRationals([{ T: "5/3" }]), (ctx, p) => {
  const mRef = ref("si", "m");
  const mv = ctx.read(mRef), m = num(mv);
  if (m === null) return allUndefined(ctx, targetShape, mv, mRef);
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!;
  ctx.term("target", `distance from ${Qn.toWire(m)} to ${p.T}`, gap(m, P(p.T)), [mRef]);
  const gt = gcdTerm(m.n, c.n, `common factor of the tops ${m.n} and ${c.n}`);
  ctx.term("gcd-tops", gt.label, gt.value, [mRef, cRef]);
  const gb = gcdTerm(m.d, c.d, `common factor of the bottoms ${m.d} and ${c.d}`);
  ctx.term("same-den", gb.label, gb.value, [mRef, cRef]);
  ctx.mark({ kind: "focus", ref: mRef });
});

// ---------------------------------------------------------------- Near the Point

/**
 * The whole-number point of a·x + b·y + c = 0 (a, b, c whole) nearest (u, v), and its squared distance; null when the
 * line passes through none (gcd(a, b) does not divide c). The line's whole points are (x0, y0) + k·(b, −a)/g: the
 * squared distance is a convex quadratic in k, so the best k is the floor or the ceiling of its real minimum.
 */
export function nearestLatticePoint(a: bigint, b: bigint, c: bigint, u: Q, v: Q): { x: bigint; y: bigint; d2: Q } | null {
  // Extended Euclid: a·s + b·t = g.
  let [r0, r1, s0, s1, t0, t1] = [a, b, 1n, 0n, 0n, 1n];
  while (r1 !== 0n) { const k = r0 / r1; [r0, r1] = [r1, r0 - k * r1]; [s0, s1] = [s1, s0 - k * s1]; [t0, t1] = [t1, t0 - k * t1]; }
  if (r0 < 0n) { r0 = -r0; s0 = -s0; t0 = -t0; }
  const g = r0;
  if (g === 0n || c % g !== 0n) return null;
  const x0 = s0 * (-c / g), y0 = t0 * (-c / g), dx = b / g, dy = -a / g;
  // k* = ((u − x0)·dx + (v − y0)·dy) / (dx² + dy²)
  const kStar = Qn.div(Qn.add(Qn.mul(Qn.sub(u, q(x0)), q(dx)), Qn.mul(Qn.sub(v, q(y0)), q(dy))), q(dx * dx + dy * dy));
  let best: { x: bigint; y: bigint; d2: Q } | null = null;
  for (const k of [Qn.floor(kStar), Qn.floor(kStar) + 1n]) {
    const x = x0 + k * dx, y = y0 + k * dy;
    const ex = Qn.sub(q(x), u), ey = Qn.sub(q(y), v);
    const d2 = Qn.add(Qn.mul(ex, ex), Qn.mul(ey, ey));
    if (!best || Qn.cmp(d2, best.d2) < 0) best = { x, y, d2 };
  }
  return best;
}

export type PointParams = { u: string; v: string };
const pointShape: Shape<PointParams> = {
  main: { ...distance<PointParams>("near", "the line's height at u close to v", "", "cart"),
    sentence: p => `The line should pass as close as possible to the point (${p.u}, ${p.v}): when x is ${p.u}, y should be as close as possible to ${p.v}.` },
  tieBreakers: [
    { ...distance<PointParams>("lattice", "the line's whole-number point nearest the dealt point, close to it", "", "cart"),
      sentence: p => `Of the points on the line whose x and y are both whole numbers, the one nearest (${p.u}, ${p.v}) should be as close to it as possible (a line through no such point counts as worst).` },
    { ...more<PointParams>("gcd-x", "common factor of the whole numbers nearest the x-intercept and y at u", "", "cart"),
      sentence: p => `The whole number nearest where the line crosses the x-axis and the whole number nearest y when x is ${p.u} should have as big a common factor as possible.` },
  ],
};
export const nearPoint = family<PointParams>("near-point", "Near the Point", ["cart", "si", "gen", "crossing"], pointShape, onRationals([{ u: "2", v: "7/3" }]), (ctx, p) => {
  const u = P(p.u), v = P(p.v);
  const yRef = ref("si", "y", { q: u });
  const yv = ctx.read(yRef), y = num(yv);
  if (y === null) return allUndefined(ctx, pointShape, yv, yRef);   // vertical
  ctx.term("near", `|y(${p.u}) − ${p.v}| = |${Qn.toWire(y)} − ${p.v}|`, gap(y, v), [yRef]);
  const [aRef, bRef, cRef] = (["a", "b", "c"] as const).map(n => ref("gen", n));
  const [a, b, c] = [aRef!, bRef!, cRef!].map(r => num(ctx.read(r))!.n) as [bigint, bigint, bigint];
  const lp = nearestLatticePoint(a, b, c, u, v);
  ctx.term("lattice", lp ? `distance² from (${lp.x}, ${lp.y}) to (${p.u}, ${p.v})` : "the line passes through no point with whole x and y",
    lp ? lp.d2 : { undefined: "no point of the line has whole x and y" }, [aRef!, bRef!, cRef!]);
  if (lp) {
    const at = ref("cart", "pointAtX", { q: q(lp.x) });
    ctx.read(at);
    ctx.mark({ kind: "candidate", ref: at, term: "lattice" });
  }
  const xRef = ref("crossing", "x0");
  const xv = ctx.read(xRef), X = num(xv);
  const g = X === null ? null : gcdTerm(nearestInteger(X), nearestInteger(y), `common factor of ${nearestInteger(X)} (nearest the x-intercept) and ${nearestInteger(y)} (nearest y(${p.u}))`);
  ctx.term("gcd-x", g ? g.label : "the x-intercept's nearest whole number", g ? g.value : undef(xv), [xRef, yRef]);
  const pRef = ref("cart", "pointAtX", { q: u });
  ctx.read(pRef);
  ctx.mark({ kind: "focus", ref: pRef });
});

// ---------------------------------------------------------------- Smooth Crossing (an adversary, owner decision 30)

const isSmooth = (n: bigint): boolean => {
  let m = abs(n);
  if (m === 0n) return false;
  for (const p of [2n, 3n, 5n, 7n]) while (m % p === 0n) m /= p;
  return m === 1n;
};
/**
 * The 7-smooth whole number (only 2s, 3s, 5s and 7s multiplied, 1 included) nearest x, sign kept, size at least 1:
 * x = 0 gives 1. Halfway between two, the smaller in size. Searches outward from |x|; a power of 2 lies in every
 * [n, 2n], so the search ends.
 */
export function nearestSmooth(x: Q): bigint {
  const t = Qn.abs(x), sign = Qn.sign(x) < 0 ? -1n : 1n;
  let lo = Qn.floor(t);
  while (lo >= 1n && !isSmooth(lo)) lo--;
  let hi = Qn.ceil(t);
  if (hi < 1n) hi = 1n;
  while (!isSmooth(hi)) hi++;
  if (lo < 1n) return sign * hi;
  return sign * (Qn.cmp(Qn.sub(t, q(lo)), Qn.sub(q(hi), t)) <= 0 ? lo : hi);
}
const gcdB = (a: bigint, b: bigint): bigint => { let x = abs(a), y = abs(b); while (y) [x, y] = [y, x % y]; return x; };

const smoothShape: Shape<object> = {
  main: distance("smooth", "the x-axis crossing close to a 7-smooth number",
    "The line should cross the x-axis as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s (like 1, 12, 35, 64 or 360).", "crossing"),
  tieBreakers: [
    more("shared", "prime factors shared with the y-intercept's nearest whole number",
      "That number and the whole number nearest the y-intercept should share as many prime factors as possible, counting repeats.", "crossing"),
  ],
};
export const smoothCrossing = family("smooth-crossing", "Smooth Crossing", ["crossing", "si", "cart"], smoothShape, onRationals([{}]), ctx => {
  const xRef = ref("crossing", "x0");
  const xv = ctx.read(xRef), X = num(xv);
  if (X === null) return allUndefined(ctx, smoothShape, xv, xRef);   // a flat line never crosses
  const s = nearestSmooth(X);
  ctx.term("smooth", `distance from the crossing ${Qn.toWire(X)} to ${s}`, gap(X, q(s)), [xRef]);
  // A vertical line crosses but has no y-intercept: undefined. A 0 on the y-intercept side shares nothing (0), as the card says.
  const cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) ctx.term("shared", "the y-intercept's nearest whole number", undef(cv), [xRef, cRef]);
  else {
    const n = nearestInteger(c), g = n === 0n ? 0n : gcdB(s, n);
    ctx.term("shared", n === 0n ? "the y-intercept's nearest whole number is 0: nothing shared (counted as 0)" : `prime factors of gcd(${s}, ${n}) = ${g}`,
      q(primeFactorCount(g)), [xRef, cRef]);
  }
  ctx.mark({ kind: "focus", ref: xRef });
  const km = ref("cart", "xAxisMark", { x: s });
  ctx.read(km);
  ctx.mark({ kind: "candidate", ref: km, term: "smooth" });
});

// ---------------------------------------------------------------- More adversaries (owner decision 30)

/** Ω(gcd(a, b)), prime factors counted with repeats; 0 when either is 0 (0 shares nothing, as the cards say). */
export const sharedOmega = (a: bigint, b: bigint): bigint => (a === 0n || b === 0n ? 0n : BigInt(primeFactorCount(gcdB(a, b))));
const sharedLabel = (a: bigint, b: bigint, what: string): string =>
  a === 0n || b === 0n ? `${what}: one is 0, so nothing is shared (counted as 0)` : `${what}: prime factors of gcd(${a}, ${b}) = ${gcdB(a, b)}`;
const SMOOTH_GLOSS = "Smooth numbers are built from small primes; 360 = 2·2·2·3·3·5 is smooth, 367 (a prime) is not.";

const smoothInterceptShape: Shape<object> = {
  main: distance("smooth", "the y-intercept close to a 7-smooth number",
    `The y-intercept should be as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s (like 12, 35, 64 or 360). ${SMOOTH_GLOSS}`, "si"),
  tieBreakers: [
    more("shared", "prime factors shared with the x-intercept's nearest whole number",
      "That number and the whole number nearest the x-intercept should share as many prime factors as possible, counting repeats.", "si"),
  ],
};
export const smoothIntercept = family("smooth-intercept", "Smooth Intercept", ["si", "crossing", "cart"], smoothInterceptShape, onRationals([{}]), ctx => {
  const cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) return allUndefined(ctx, smoothInterceptShape, cv, cRef);   // vertical
  const s = nearestSmooth(c);
  ctx.term("smooth", `distance from the y-intercept ${Qn.toWire(c)} to ${s}`, gap(c, q(s)), [cRef]);
  // A flat line never crosses the x-axis: nothing shared (0), as the card says.
  const xRef = ref("crossing", "x0");
  const X = num(ctx.read(xRef));
  const n = X === null ? 0n : nearestInteger(X);
  ctx.term("shared", X === null ? "a flat line never crosses the x-axis: nothing shared (counted as 0)" : sharedLabel(s, n, `${s} and ${n} (nearest the x-intercept)`),
    q(sharedOmega(s, n)), [cRef, xRef]);
  ctx.mark({ kind: "focus", ref: cRef });
  const mark = ref("cart", "yAxisMark", { y: s });
  ctx.read(mark);
  ctx.mark({ kind: "candidate", ref: mark, term: "smooth" });
});

const steepShape: Shape<object> = {
  main: more("smaller", "the smaller of the gradient and the y-intercept",
    "Make the gradient and the y-intercept both positive and both as big as possible: your score is the smaller of the two.", "si"),
  tieBreakers: [
    more("shared", "prime factors shared by the whole parts of the gradient and the y-intercept",
      "The whole parts of the gradient and the y-intercept (rounded down) should share as many prime factors as possible, counting repeats.", "si"),
  ],
};
export const steepAndTall = family("steep-and-tall", "Steep and Tall", ["si"], steepShape, onRationals([{}]), ctx => {
  const mRef = ref("si", "m");
  const mv = ctx.read(mRef), m = num(mv);
  if (m === null) return allUndefined(ctx, steepShape, mv, mRef);
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!;
  ctx.term("smaller", `the smaller of ${Qn.toWire(m)} and ${Qn.toWire(c)}`, Qn.cmp(m, c) <= 0 ? m : c, [mRef, cRef]);
  const fm = Qn.floor(m), fc = Qn.floor(c);
  ctx.term("shared", sharedLabel(fm, fc, `⌊m⌋ = ${fm} and ⌊c⌋ = ${fc}`), q(sharedOmega(fm, fc)), [mRef, cRef]);
  ctx.mark({ kind: "focus", ref: Qn.cmp(m, c) <= 0 ? mRef : cRef });
});

const smoothGradientShape: Shape<object> = {
  main: distance("smooth", "the gradient close to a 7-smooth number",
    `The gradient should be as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s (like 1, 12, 35, 64 or 360). ${SMOOTH_GLOSS}`, "si"),
  tieBreakers: [
    more("shared", "prime factors shared with the y-intercept's nearest whole number",
      "That number and the whole number nearest the y-intercept should share as many prime factors as possible, counting repeats.", "si"),
  ],
};
export const smoothGradient = family("smooth-gradient", "Smooth Gradient", ["si"], smoothGradientShape, onRationals([{}]), ctx => {
  const mRef = ref("si", "m");
  const mv = ctx.read(mRef), m = num(mv);
  if (m === null) return allUndefined(ctx, smoothGradientShape, mv, mRef);
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!;
  const s = nearestSmooth(m), n = nearestInteger(c);
  ctx.term("smooth", `distance from the gradient ${Qn.toWire(m)} to ${s}`, gap(m, q(s)), [mRef]);
  ctx.term("shared", sharedLabel(s, n, `${s} and ${n} (nearest the y-intercept)`), q(sharedOmega(s, n)), [mRef, cRef]);
  ctx.mark({ kind: "focus", ref: mRef });
});

const smoothSquareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line makes with the axes should have an area as close as possible to a square number.", "tri"),
  tieBreakers: [
    more("shared", "prime factors shared by that square's root and the x-intercept's nearest whole number",
      "That square's root and the whole number nearest the x-intercept should share as many prime factors as possible, counting repeats.", "tri"),
  ],
};
export const smoothSquare = family("smooth-square", "Smooth Square", ["tri", "crossing"], smoothSquareShape, onRationals([{}]), ctx => {
  const aRef = ref("tri", "area");
  const av = ctx.read(aRef), A = num(av);
  if (A === null) return allUndefined(ctx, smoothSquareShape, av, aRef);   // no triangle
  const xRef = ref("crossing", "x0");
  const X = num(ctx.read(xRef))!;   // a triangle needs a slanted line
  const r = nearestSquareRoot(A), n = nearestInteger(X);   // Square Area's nearest square
  ctx.term("square", `distance from the area to ${r * r}`, gap(A, q(r * r)), [aRef]);
  ctx.term("shared", sharedLabel(r, n, `the root ${r} and ${n} (nearest the x-intercept)`), q(sharedOmega(r, n)), [aRef, xRef]);
  ctx.mark({ kind: "note", ref: aRef, text: `area ${Qn.toWire(A)}, nearest square ${r * r} = ${r}²` });
});

const sunkenShape: Shape<object> = {
  main: more("sunken", "the y-intercept far below zero", "The y-intercept should be below zero, as far below as possible.", "si"),
  tieBreakers: [
    more("shared", "prime factors shared by the y-intercept's nearest whole number and the gradient's top",
      "The whole number nearest the y-intercept and the gradient's top number (in lowest terms) should share as many prime factors as possible, counting repeats.", "si"),
  ],
};
export const sunkenIntercept = family("sunken-intercept", "Sunken Intercept", ["si"], sunkenShape, onRationals([{}]), ctx => {
  const cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) return allUndefined(ctx, sunkenShape, cv, cRef);   // vertical
  const mRef = ref("si", "m");
  const m = num(ctx.read(mRef))!;
  const n = nearestInteger(c);
  ctx.term("sunken", `minus the y-intercept ${Qn.toWire(c)}`, Qn.neg(c), [cRef]);
  ctx.term("shared", sharedLabel(n, m.n, `${n} (nearest the y-intercept) and the gradient's top ${m.n}`), q(sharedOmega(n, m.n)), [cRef, mRef]);
  ctx.mark({ kind: "focus", ref: cRef });
});

/** The second batch of rational-native families: on the line type, in no pool. */
export const rational2Families = [wholeArea, wholeAtT, targetGradient, nearPoint, smoothCrossing, smoothIntercept, steepAndTall, smoothGradient, smoothSquare, sunkenIntercept] as const;
