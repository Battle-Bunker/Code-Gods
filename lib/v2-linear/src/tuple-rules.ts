/**
 * The owner's two example rules in the tuple shape (design-principles.md principle 3b, 16 November): "primary
 * preferences that use nearest desired value and then a secondary preferences that scores proximity to it and then we
 * can use a tertiary preference to integrate another dimension of the line". Every line has a nearest target, so there
 * is no cliff: a bump inside the target's basin keeps the primary and loses a little proximity; a bump across to the
 * next target changes the primary by one step. Undealt (pool-plan.md: the owner reads the cards first).
 *
 * - Prime Intercept: (1) the prime ending in k nearest the y-intercept, the bigger the better; (2) how close the
 *   y-intercept is to it; (3) how close the gradient is to 1 over that prime, measured in doublings (log space).
 * - Power Area: (1) the power of k nearest the area of the triangle the line cuts off the axes, the higher the better;
 *   (2) how close the area is to it; (3) how close the area divided by the x-crossing (that is half the y-intercept's
 *   size) is to a multiple of k.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, family, num, type L, type Shape } from "./layers.ts";
import { nearestOnLadder, nearestPrimeEnding } from "./numbers.ts";
import { digitSum, nearestPalindrome, nearestPile } from "./beginner-rulers.ts";

/** A tuple family is valued down its tree (owner decision 45; lib/v2-valuation tree-value.ts). */
const tree = <F extends object>(f: F): F & { valuation: "tree" } => ({ ...f, valuation: "tree" as const });
/** A float as an exact rational to a millionth (log-space distances only). */
const fromFloat = (x: number): Q => q(BigInt(Math.round(x * 1e6)), 1_000_000n);
/** log2 of a positive whole number of any size (to double precision). */
const log2B = (b: bigint): number => { const L = b.toString(2).length; return L <= 1000 ? Math.log2(Number(b)) : (L - 53) + Math.log2(Number(b >> BigInt(L - 53))); };
/** log2 |x| of a nonzero rational of any size. */
const log2Q = (x: Q): number => log2B(x.n < 0n ? -x.n : x.n) - log2B(x.d);

// ---------------------------------------------------------------- Prime Intercept

type PI = { ends: number };
const piShape: Shape<PI> = {
  main: { id: "prime", title: "the prime ending in k nearest the y-intercept, the bigger the better", rep: "si", sense: "max",
    sentence: p => `Look at the y-intercept, ignoring a minus sign, and find the prime number ending in ${p.ends} nearest to it (for example 11, 31, 41, 61, 71, 101 for 1). The bigger that prime, the better.` },
  tieBreakers: [
    { id: "closeness", title: "how close the y-intercept is to that prime", rep: "si", sense: "min",
      sentence: () => "The y-intercept (ignoring a minus sign) should be as close as possible to that prime." } as L<PI>,
    { id: "gradient-log", title: "how close the gradient is to 1 over that prime, in doublings", rep: "si", sense: "min",
      sentence: () => "The gradient's size times that prime should be as close as possible to 1, counted in doublings: 2 and 1/2 are both one doubling away, 4 and 1/4 two." } as L<PI>,
  ],
};
export const primeIntercept = tree(family<PI>("prime-intercept", "Prime Intercept", ["si", "cart"], piShape,
  [1, 3, 7, 9].map(ends => ({ ends })), (ctx, pr) => {
    const cRef = ref("si", "c"), mRef = ref("si", "m");
    const cv = ctx.read(cRef), c = num(cv);
    if (c === null) return allUndefined(ctx, piShape, cv, cRef);   // vertical: no y-intercept
    const x = Qn.abs(c);   // the y-intercept's size: a reflection y → −y keeps the score
    const p = nearestPrimeEnding(x, pr.ends);
    ctx.term("prime", `the prime ending in ${pr.ends} nearest the y-intercept's size ${Qn.toWire(x)} is ${p}`, q(p), [cRef]);
    const d = Qn.abs(Qn.sub(x, q(p)));
    ctx.term("closeness", `${Qn.toWire(d)} from ${p}`, d, [cRef]);
    const m = num(ctx.read(mRef))!;
    const lg = Qn.sign(m) === 0 ? null : Math.abs(log2Q(m) + log2B(p));
    const at = (v: bigint) => { const r = ref("cart", "yAxisMark", { y: Qn.sign(c) < 0 ? q(-v) : q(v) }); ctx.read(r); return r; };
    const yInt = ref("cart", "yInt"); ctx.read(yInt);
    ctx.mark({ kind: "focus", ref: cRef, term: "prime" });
    ctx.mark({ kind: "candidate", ref: at(p), term: "prime" });
    ctx.mark({ kind: "candidate", ref: at(nearestPrimeEnding(q(p + 10n), pr.ends)), term: "prime" });
    ctx.mark({ kind: "measure", from: yInt, to: at(p), term: "closeness" });
    ctx.mark({ kind: "focus", ref: mRef, term: "gradient-log" });
    ctx.term("gradient-log", lg === null ? "a flat line: the gradient is 0" : `the gradient's size times ${p}: ${lg.toFixed(2)} doublings from 1`,
      lg === null ? { undefined: "a flat line has no gradient to compare" } : fromFloat(lg), [mRef, cRef]);
  }));

// ---------------------------------------------------------------- Power Area

type PA = { k: number };
const paShape: Shape<PA> = {
  main: { id: "power", title: "the power of k nearest the area, the higher the better", rep: "tri", sense: "max",
    sentence: p => `The line and the two axes make a triangle. Find the power of ${p.k} nearest its area (${[1, 2, 3, 4].map(j => p.k ** j).join(", ")}, …). The higher that power, the better.` },
  tieBreakers: [
    { id: "closeness", title: "how close the area is to that power", rep: "tri", sense: "min",
      sentence: () => "The area should be as close as possible to that power." } as L<PA>,
    { id: "per-crossing", title: "how close the area over the x-crossing is to a multiple of k", rep: "tri", sense: "min",
      sentence: p => `The area divided by where the line crosses the x-axis (ignoring signs) should be as close as possible to a multiple of ${p.k} (0, ${p.k}, ${2 * p.k}, …).` } as L<PA>,
  ],
};
/** The power k^j (j ≥ 0) nearest a > 0 (the higher on a tie). */
export function nearestPower(a: Q, k: number): { j: number; at: bigint } {
  const K = BigInt(k);
  let j = 0, at = 1n;
  while (Qn.cmp(q(at * K), a) <= 0) { at *= K; j++; }
  const lo = Qn.sub(a, q(at)), hi = Qn.sub(q(at * K), a);
  return Qn.cmp(hi, lo) <= 0 ? { j: j + 1, at: at * K } : { j, at };
}
export const powerArea = tree(family<PA>("power-area", "Power Area", ["tri", "crossing"], paShape, [2, 3, 5, 7].map(k => ({ k })), (ctx, pr) => {
  const area = ref("tri", "area"), xRef = ref("crossing", "x0");
  const av = ctx.read(area), a = num(av);
  if (a === null) return allUndefined(ctx, paShape, av, area);   // no triangle
  const { j, at } = nearestPower(a, pr.k);
  ctx.term("power", `the power of ${pr.k} nearest the area ${Qn.toWire(a)} is ${pr.k}^${j} = ${at}`, q(j), [area]);
  const d = Qn.abs(Qn.sub(a, q(at)));
  ctx.term("closeness", `${Qn.toWire(d)} from ${at}`, d, [area]);
  const x = num(ctx.read(xRef))!;
  const r = Qn.div(a, Qn.abs(x)), K = q(pr.k), n = Qn.floor(Qn.div(r, K));
  const off = Qn.sub(r, Qn.mul(K, q(n))), dk = Qn.cmp(off, Qn.sub(K, off)) <= 0 ? off : Qn.sub(K, off);
  ctx.term("per-crossing", `the area over the x-crossing is ${Qn.toWire(r)}, ${Qn.toWire(dk)} from a multiple of ${pr.k}`, dk, [area, xRef]);
  ctx.mark({ kind: "focus", ref: area, term: "power" });
  ctx.mark({ kind: "note", ref: area, term: "closeness", text: `area ${Qn.toWire(a)} is ${Qn.toWire(d)} from ${pr.k}^${j} = ${at}` });
  ctx.mark({ kind: "focus", ref: xRef, term: "per-crossing" });
  ctx.mark({ kind: "note", ref: xRef, term: "per-crossing", text: `${Qn.toWire(a)} ÷ ${Qn.toWire(Qn.abs(x))} = ${Qn.toWire(r)}` });
}));

// ---------------------------------------------------------------- the repaired families, recast (pool-plan.md v2)

/** A distance to the nearest multiple of n (n > 0). */
const toMultiple = (x: Q, n: Q): Q => { const f = Qn.floor(Qn.div(x, n)), lo = Qn.sub(x, Qn.mul(n, q(f))), hi = Qn.sub(n, lo); return Qn.cmp(lo, hi) <= 0 ? lo : hi; };
/** |log2(|x| · n)|: how many doublings x · n is from 1 (null for x = 0). */
const doublings = (x: Q, n: bigint): Q | null => (Qn.sign(x) === 0 || n <= 0n ? null : fromFloat(Math.abs(log2Q(x) + log2B(n))));
const NOTHING = { undefined: "nothing to read" } as const;
type Third<P> = { layer: L<P>; value: (r: { m: Q | null; c: Q | null; x: Q; n: bigint; at: Q }, p: P) => Q | null };
/** A tuple family: (1) the nearest target's size, (2) the distance to it, (3+) a third part of the line against it. */
function tupleFamily<P extends object>(o: {
  id: string; title: string; depends: string[]; versions: P[]; rep: string;
  main: (p: P) => string; close: (p: P) => string;
  read: (ctx: Parameters<Parameters<typeof family>[5]>[0], p: P) => { x: Q; m: Q | null; c: Q | null; from: ReturnType<typeof ref>[]; sign?: number } | { none: ElementValueLike; from: ReturnType<typeof ref> };
  nearest: (x: Q, p: P) => { size: Q; n: bigint; at: Q; why: string; next?: Q };
  thirds: Third<P>[];
  /** Where the reading and its targets are drawn (the annotation contract, #960): the measure's start, a target's element. */
  marks?: { from: ReturnType<typeof ref>; target: (at: Q) => ReturnType<typeof ref> };
  /** Each third part's own reading (its focus), by layer id. */
  thirdReads?: Readonly<Record<string, ReturnType<typeof ref>>>;
}) {
  const shape: Shape<P> = {
    main: { id: "target", title: "the nearest target's size, the bigger the better", rep: o.rep, sense: "max", sentence: o.main },
    tieBreakers: [{ id: "closeness", title: "how close to that target", rep: o.rep, sense: "min", sentence: o.close } as L<P>, ...o.thirds.map(t => t.layer)],
  };
  return tree(family<P>(o.id, o.title, o.depends, shape, o.versions, (ctx, p) => {
    const r = o.read(ctx, p);
    if ("none" in r) return allUndefined(ctx, shape, r.none as never, r.from);
    const t = o.nearest(r.x, p);
    ctx.term("target", t.why, t.size, r.from);
    const d = Qn.abs(Qn.sub(r.x, t.at));
    ctx.term("closeness", `${Qn.toWire(d)} from ${Qn.toWire(t.at)}`, d, r.from);
    for (const th of o.thirds) { const v = th.value({ m: r.m, c: r.c, x: r.x, n: t.n, at: t.at }, p); ctx.term(th.layer.id, th.layer.title, v === null ? NOTHING : v, r.from); }
    // Marks, each with its layer's term (the annotation contract, #960); every cited element is read first.
    const reading = r.from[0]!;
    ctx.mark({ kind: "focus", ref: reading, term: "target" });
    if (o.marks) {
      const signed = (v: Q) => (r.sign !== undefined && r.sign < 0 ? Qn.neg(v) : v);
      const tgt = o.marks.target(signed(t.at));
      ctx.read(tgt); ctx.read(o.marks.from);
      ctx.mark({ kind: "candidate", ref: tgt, term: "target" });
      if (t.next) { const nx = o.marks.target(signed(t.next)); ctx.read(nx); ctx.mark({ kind: "candidate", ref: nx, term: "target" }); }
      ctx.mark({ kind: "measure", from: o.marks.from, to: tgt, term: "closeness" });
    } else ctx.mark({ kind: "note", ref: reading, term: "closeness", text: `${Qn.toWire(r.x)} is ${Qn.toWire(d)} from ${Qn.toWire(t.at)}` });
    for (const th of o.thirds) {
      const at = o.thirdReads?.[th.layer.id];
      if (at) { ctx.read(at); ctx.mark({ kind: "focus", ref: at, term: th.layer.id }); }
    }
  }));
}
type ElementValueLike = unknown;
const lineMC = (ctx: Parameters<Parameters<typeof family>[5]>[0]) => ({ m: num(ctx.read(ref("si", "m"))), c: num(ctx.read(ref("si", "c"))) });

type K = { ends: number };
/** Prime Landing, recast: the prime ending in k nearest the x-crossing's size. */
export const landingTuple = tupleFamily<K>({
  id: "landing-tuple", title: "Prime Landing (tuple)", depends: ["crossing", "si", "cart"], versions: [1, 3, 7, 9].map(ends => ({ ends })), rep: "crossing",
  main: p => `Find where the line crosses the x-axis, ignoring a minus sign, and the prime ending in ${p.ends} nearest to it. Primary: that prime, bigger is better.`,
  close: () => "How far the crossing is from that prime: closer is better.",
  read: ctx => { const xr = ref("crossing", "x0"), xv = ctx.read(xr), x = num(xv); if (x === null) return { none: xv, from: xr }; return { x: Qn.abs(x), sign: Qn.sign(x), ...lineMC(ctx), from: [xr] }; },
  marks: { from: ref("cart", "xInt"), target: at => ref("cart", "xAxisMark", { x: at }) },
  thirdReads: { "intercept-multiple": ref("si", "c"), "gradient-log": ref("si", "m"), "intercept-whole": ref("si", "c") },
  nearest: (x, p) => { const n = nearestPrimeEnding(x, p.ends); return { size: q(n), n, at: q(n), why: `nearest prime ending in ${p.ends}: ${n}` }; },
  thirds: [
    { layer: { id: "intercept-multiple", title: "the y-intercept near a multiple of the prime", rep: "si", sense: "min", sentence: () => "The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of that prime." }, value: (r) => (r.c === null ? null : toMultiple(Qn.abs(r.c), q(r.n))) },
    { layer: { id: "gradient-log", title: "the gradient times the prime near 1", rep: "si", sense: "min", sentence: () => "The gradient's size times that prime should be as close to 1 as possible, counted in doublings." }, value: r => (r.m === null ? null : doublings(r.m, r.n)) },
  ],
});
/** Ruler, recast: the prime ending in k nearest the distance² from (0, 0). */
export const rulerTuple = tupleFamily<K>({
  id: "ruler-tuple", title: "Ruler (tuple)", depends: ["norm", "si"], versions: [1, 3, 7, 9].map(ends => ({ ends })), rep: "norm",
  main: p => `Square the distance from (0, 0) to the line, and find the prime ending in ${p.ends} nearest to it. Primary: that prime, bigger is better.`,
  close: () => "How far the distance squared is from that prime: closer is better.",
  read: ctx => { const dr = ref("norm", "dist2"), dv = ctx.read(dr), d = num(dv); if (d === null) return { none: dv, from: dr }; return { x: d, ...lineMC(ctx), from: [dr] }; },
  thirdReads: { "intercept-multiple": ref("si", "c"), "gradient-log": ref("si", "m") },
  nearest: (x, p) => { const n = nearestPrimeEnding(x, p.ends); return { size: q(n), n, at: q(n), why: `nearest prime ending in ${p.ends}: ${n}` }; },
  thirds: [
    { layer: { id: "intercept-multiple", title: "the y-intercept near a whole number", rep: "si", sense: "min", sentence: () => "The y-intercept (ignoring a minus sign) should be as close as possible to a whole number." }, value: r => (r.c === null ? null : toMultiple(Qn.abs(r.c), Qn.ONE)) },
    { layer: { id: "gradient-log", title: "the gradient times the prime near 1", rep: "si", sense: "min", sentence: () => "The gradient's size times that prime should be as close to 1 as possible, counted in doublings." }, value: r => (r.m === null ? null : doublings(r.m, r.n)) },
  ],
});
/** Treasure, recast: the triangle number nearest y at x = k. */
type TK = { k: number };
const triangle = (x: Q): { t: bigint; n: bigint } => nearestPile(x);
export const treasureTuple = tupleFamily<TK>({
  id: "treasure-tuple", title: "Treasure (tuple)", depends: ["table", "si"], versions: [3, 4, 5, 7].map(k => ({ k })), rep: "table",
  main: p => `Work out y when x is ${p.k}, ignoring a minus sign. Triangle numbers are 1, 3, 6, 10, 15, …: the n-th is 1 + 2 + … + n (rows of 1, 2, 3, … coins). Find the triangle number nearest to y. Primary: that number, bigger is better.`,
  close: () => "How far y is from that triangle number: closer is better.",
  read: (ctx, p) => { const yr = ref("table", "y", { x: p.k }), yv = ctx.read(yr), y = num(yv); if (y === null) return { none: yv, from: yr }; return { x: Qn.abs(y), ...lineMC(ctx), from: [yr] }; },
  thirdReads: { "gradient-rows": ref("si", "m"), "intercept-multiple": ref("si", "c") },
  nearest: x => { const { t, n } = triangle(x); return { size: q(t), n, at: q(t), why: `nearest triangle number: ${t} = 1 + … + ${n}` }; },
  thirds: [
    { layer: { id: "gradient-rows", title: "the gradient near the triangle's row count", rep: "si", sense: "min", sentence: () => "The gradient (ignoring a minus sign) should be as close as possible to n, the number of rows in that triangle number." }, value: r => (r.m === null ? null : Qn.abs(Qn.sub(Qn.abs(r.m), q(r.n)))) },
    { layer: { id: "intercept-multiple", title: "the y-intercept near a multiple of the row count", rep: "si", sense: "min", sentence: () => "The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of n." }, value: r => (r.c === null ? null : toMultiple(Qn.abs(r.c), q(r.n))) },
  ],
});
/** Same on Both Rulers, recast: the palindrome nearest where the line meets y = x (or y = −x). */
type PD = { digits: "odd" | "even"; meets: 1 | -1 };
export const rulersTuple = tupleFamily<PD>({
  id: "rulers-tuple", title: "Same on Both Rulers (tuple)", depends: ["si"], rep: "si",
  versions: (["odd", "even"] as const).flatMap(digits => ([1, -1] as const).map(meets => ({ digits, meets }))),
  main: p => `Find where the line meets y = ${p.meets === 1 ? "x" : "−x"}, ignoring a minus sign. A palindrome reads the same backwards (7, 44, 343, 1221); find the one with an ${p.digits} number of digits nearest to it. Primary: that palindrome, bigger is better.`,
  close: () => "How far the meeting point is from that palindrome: closer is better.",
  read: (ctx, p) => {
    const mRef = ref("si", "m"), { m, c } = lineMC(ctx);
    if (m === null || c === null) return { none: { undefined: "a vertical line" }, from: mRef };
    const den = Qn.sub(q(p.meets), m);
    if (Qn.sign(den) === 0) return { none: { undefined: "parallel: it never meets" }, from: mRef };
    return { x: Qn.abs(Qn.div(c, den)), m, c, from: [mRef, ref("si", "c")] };
  },
  thirdReads: { "gradient-digits": ref("si", "m"), "intercept-multiple": ref("si", "c") },
  nearest: (x, p) => { const n = nearestPalindrome(x, p.digits); return { size: q(n), n, at: q(n), why: `nearest palindrome: ${n}` }; },
  thirds: [
    { layer: { id: "gradient-digits", title: "the gradient near the palindrome's digit sum", rep: "si", sense: "min", sentence: () => "The gradient (ignoring a minus sign) should be as close as possible to that palindrome's digits added up." }, value: r => (r.m === null ? null : Qn.abs(Qn.sub(Qn.abs(r.m), q(digitSum(r.n))))) },
    { layer: { id: "intercept-multiple", title: "the y-intercept near a multiple of 11", rep: "si", sense: "min", sentence: () => "The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of 11." }, value: r => (r.c === null ? null : toMultiple(Qn.abs(r.c), q(11))) },
  ],
});
/** Whole Crossing, recast: the 5s-ladder number nearest the x-crossing; its count of 5s. */
type QR = { q: number; r: number };
export const crossingTuple = tupleFamily<QR>({
  id: "crossing-tuple", title: "Whole Crossing (tuple)", depends: ["crossing", "si", "cart"], rep: "crossing",
  versions: [3, 5, 7].flatMap(qq => Array.from({ length: qq - 1 }, (_, i) => ({ q: qq, r: i + 1 }))),
  main: p => `Find where the line crosses the x-axis, ignoring a minus sign. Ladder numbers are those that, once every ${p.q} is divided out, leave ${p.r} when divided by ${p.q} (for example ${p.r}, ${p.r + p.q}, ${p.q * p.r}, ${p.q * p.q * p.r}). Find the ladder number nearest the crossing. Primary: how many ${p.q}s it holds, more is better.`,
  close: () => "How far the crossing is from that ladder number: closer is better.",
  read: ctx => { const xr = ref("crossing", "x0"), xv = ctx.read(xr), x = num(xv); if (x === null) return { none: xv, from: xr }; return { x: Qn.abs(x), sign: Qn.sign(x), ...lineMC(ctx), from: [xr] }; },
  marks: { from: ref("cart", "xInt"), target: at => ref("cart", "xAxisMark", { x: at }) },
  thirdReads: { "intercept-multiple": ref("si", "c"), "gradient-log": ref("si", "m"), "intercept-whole": ref("si", "c") },
  nearest: (x, p) => { const o = nearestOnLadder(x, p); const at = o.at < 0n ? -o.at : o.at; return { size: q(o.j), n: at, at: q(at), why: `nearest ladder number: ${at} = ${p.q}^${o.j} × ${o.t}` }; },
  thirds: [
    { layer: { id: "gradient-log", title: "the gradient times the ladder number near 1", rep: "si", sense: "min", sentence: () => "The gradient's size times that ladder number should be as close to 1 as possible, counted in doublings." }, value: r => (r.m === null ? null : doublings(r.m, r.n === 0n ? 1n : r.n)) },
    { layer: { id: "intercept-whole", title: "the y-intercept near a whole number", rep: "si", sense: "min", sentence: () => "The y-intercept should be as close as possible to a whole number." }, value: r => (r.c === null ? null : toMultiple(Qn.abs(r.c), Qn.ONE)) },
  ],
});
export const tupleFamilies = [primeIntercept, powerArea, landingTuple, rulerTuple, treasureTuple, rulersTuple, crossingTuple] as const;
