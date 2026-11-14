/**
 * The beginner families (docs/engine-v2/layered-line-rules.md §10.5, the curator's exact-only pool; Prime Gradient is
 * in families.ts): each a main layer a 12-year-old on a standard linear-equations course can read, and the curator's
 * dealable tie-breakers, every one valued by an exact sum (sums.ts). Every layer is graded (owner decision 13). A dealt
 * rule is the main layer plus one tie-breaker (decision 14 and its clarification).
 */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { distanceToPrime, distanceToWhole, isPrime, largestPrimeFactor, nearbyPrimes, nearestSquareRoot, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

type Ctx = EvalContext<LineState>;
type L<P> = Layer<P>;

/** A distance layer: smaller is better. */
function distance<P>(id: string, title: string, sentence: string, rep: string): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "min" };
}
/** A count or size layer: bigger is better. */
function more<P>(id: string, title: string, sentence: string, rep: string | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max" };
}

/** The smallest and largest prime factor of a whole number (|n|); 1 for 0, ±1 and fractions. */
const spfQ = (x: Q): Q => q(x.d === 1n ? smallestPrimeFactor(x.n) : 1n);
const gpfQ = (x: Q): Q => q(x.d === 1n ? largestPrimeFactor(x.n) : 1n);
/** Tie-breakers on the prime factors of a coefficient (the curator's §10.5: graded, an exact Euler-type sum). */
const factorTies = <P,>(of: "m" | "c", what: string): L<P>[] => [
  more(`${of}-spf`, `${what}'s smallest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s smallest prime factor should be as big as possible.`, "si"),
  more(`${of}-gpf`, `${what}'s largest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s largest prime factor should be as big as possible.`, "si"),
];

const undef = (v: ElementValue): Undef => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));
const squareGap = (x: Q): { root: bigint; d: Q } => { const r = nearestSquareRoot(x); return { root: r, d: gap(x, q(r * r)) }; };

interface Shape<P> { main: L<P>; tieBreakers: readonly L<P>[] }
function allUndefined<P>(ctx: Ctx, f: Shape<P>, why: ElementValue, from: ElementRef): void {
  for (const l of [f.main, ...f.tieBreakers]) ctx.term(l.id, l.title, undef(why), [from]);
  ctx.mark({ kind: "note", ref: from, text: undef(why).undefined });
}
function card<P>(f: Shape<P>, p: P, tb: TieBreaker): string {
  const t = tb === null ? undefined : f.tieBreakers.find(x => x.id === tb);
  return t ? `${f.main.sentence(p)} Tie-breaker: ${t.sentence(p)}` : f.main.sentence(p);
}
/** A family with no parameters. */
function family<P extends object>(id: string, title: string, depends: string[], shape: Shape<P>, params: P[], evaluate: (ctx: Ctx, p: P) => void): RuleFamily<LineState, P> {
  return { id, title, card: (p, tb) => card(shape, p, tb), params: [], dealable: () => params, depends, ...shape, evaluate };
}

// ---------------------------------------------------------------- 1. Prime Staircase

const staircase: Shape<object> = {
  main: more("run", "a run of different primes from y(0)", "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible.", "seq"),
  // One secondary (the curator's §10.5): a run of six fixes the step at a multiple of 30, so the others order almost
  // nothing at the top.
  tieBreakers: [
    more("first-prime", "the first prime", "The first prime should be as big as possible.", "seq"),
  ],
};
export const primeStaircase = family("prime-staircase", "Prime Staircase", ["seq", "si"], staircase, [{}], ctx => {
  const first = ref("seq", "term", { n: 0 });
  const v0 = ctx.read(first);
  if (num(v0) === null) return allUndefined(ctx, staircase, v0, first);
  const seen = new Set<bigint>();
  let run = 0;
  // The run stops at the first term that is not a new prime (a repeated prime stops it too).
  let stop: ElementRef | null = null;
  for (let n = 0; n < 12 && stop === null; n++) {
    const r = ref("seq", "term", { n });
    const v = num(ctx.read(r))!;
    if (v.d === 1n && isPrime(v.n) && !seen.has(v.n)) { seen.add(v.n); run++; ctx.mark({ kind: "focus", ref: r }); } else stop = r;
  }
  const terms = Array.from({ length: run }, (_, n) => ref("seq", "term", { n }));
  ctx.term("run", "different primes from y(0)", q(run), terms.length ? terms : [first]);
  ctx.term("first-prime", "the first prime", run ? num(v0)! : Qn.ZERO, [first]);
  if (stop) ctx.mark({ kind: "note", ref: stop, text: "the run stops here" });
});

// ---------------------------------------------------------------- 2. Square Area (the owner's example 2)

const squareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line cuts off the axes should have an area as close as possible to a square number.", "tri"),
  tieBreakers: [
    more("spf", "that square's root's smallest prime factor", "The smallest prime factor of that square's root should be as big as possible.", "tri"),
    more("lpf", "that square's root's largest prime factor", "The largest prime factor of that square's root should be as big as possible.", "tri"),
    more("omega", "prime factors of that square's root", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "tri"),
  ],
};
export const squareArea = family("square-area", "Square Area", ["tri", "cart"], squareShape, [{}], ctx => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, squareShape, av, area);
  const sq = squareGap(a);
  ctx.term("square", `distance from the area to ${sq.root * sq.root}`, sq.d, [area]);
  ctx.term("spf", `smallest prime factor of ${sq.root}`, q(smallestPrimeFactor(sq.root)), [area]);
  ctx.term("lpf", `largest prime factor of ${sq.root}`, q(largestPrimeFactor(sq.root)), [area]);
  ctx.term("omega", `prime factors of ${sq.root}`, q(primeFactorCount(sq.root)), [area]);
  ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, nearest square ${sq.root * sq.root} = ${sq.root}²` });
  // The nearest square itself, as a shape the plane draws beside the triangle (marks only: no term changes).
  const sqRef = ref("tri", "square", { s: sq.root });
  ctx.read(sqRef);
  ctx.mark({ kind: "candidate", ref: sqRef, term: "square" });
});

// ---------------------------------------------------------------- 3. Treasure

type KT = { k: number; T: number };
const treasureShape: Shape<KT> = {
  main: { ...distance<KT>("treasure", "y(k) close to T", "", "table"),
    sentence: p => `When x is ${p.k}, y should be as close as possible to ${p.T}.` },
  tieBreakers: [
    ...factorTies<KT>("m", "the gradient"),
    more("prime-terms", "different primes among y(1) … y(8)", "As many as possible of y(1) … y(8) should be different primes.", "table"),
  ],
};
export const treasure = family<KT>("treasure", "Treasure", ["table", "si", "cart"], treasureShape, [{ k: 2, T: 37 }], (ctx, p) => {
  const at = ref("table", "y", { x: p.k });
  const v = ctx.read(at);
  const y = num(v);
  if (y === null) return allUndefined(ctx, treasureShape, v, at);
  const m = num(ctx.read(ref("si", "m")))!;
  const primes = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = 1; x <= 8; x++) {
    const r = ref("table", "y", { x });
    const t = num(ctx.read(r))!;
    cols.push(r);
    if (t.d === 1n && isPrime(t.n) && !primes.has(t.n)) { primes.add(t.n); ctx.mark({ kind: "focus", ref: r }); }
  }
  ctx.term("treasure", `distance from y(${p.k}) to ${p.T}`, gap(y, q(p.T)), [at]);
  ctx.term("prime-terms", "different primes among y(1) … y(8)", q(primes.size), cols);
  ctx.term("m-spf", "the gradient's smallest prime factor", spfQ(m), [ref("si", "m")]);
  ctx.term("m-gpf", "the gradient's largest prime factor", gpfQ(m), [ref("si", "m")]);
  ctx.mark({ kind: "focus", ref: at });
  // The target T on the y-axis, so the plane can draw where y(k) should land (marks only).
  const tm = ref("cart", "yAxisMark", { y: p.T });
  ctx.read(tm);
  ctx.mark({ kind: "candidate", ref: tm, term: "treasure" });
});

// ---------------------------------------------------------------- 6. Prime Landing (the owner's example 1, regraded)

const landingShape: Shape<object> = {
  main: distance("landing", "the y-intercept close to a prime", "The y-intercept should be as close as possible to a prime number.", "si"),
  tieBreakers: [
    more("big-prime", "that prime", "That prime should be as big as possible.", "si"),
    ...factorTies<object>("m", "the gradient"),
  ],
};
export const primeLanding = family("prime-landing", "Prime Landing", ["si", "cart"], landingShape, [{}], ctx => {
  const cRef = ref("si", "c"), mRef = ref("si", "m");
  const cv = ctx.read(cRef);
  const c = num(cv);
  if (c === null) return allUndefined(ctx, landingShape, cv, cRef);
  const m = num(ctx.read(mRef))!;
  const p = nearbyPrimes(c)[0]!;
  const mark = ref("cart", "yAxisMark", { y: p });
  ctx.read(mark);
  ctx.term("landing", `distance from the y-intercept to ${p}`, gap(c, q(p)), [cRef]);
  ctx.term("big-prime", "that prime", q(p), [cRef]);
  ctx.term("m-spf", "the gradient's smallest prime factor", spfQ(m), [mRef]);
  ctx.term("m-gpf", "the gradient's largest prime factor", gpfQ(m), [mRef]);
  ctx.mark({ kind: "focus", ref: cRef });
  ctx.mark({ kind: "candidate", ref: mark, term: "landing" });
});

// ---------------------------------------------------------------- 7. Same on Both Rulers

type T = { T: number };
const rulersShape: Shape<T> = {
  main: { ...distance<T>("fixed", "the unchanged number close to T", "", "mach"),
    sentence: p => `The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to ${p.T}.` },
  tieBreakers: [
    ...factorTies<T>("m", "the gradient"),
    more("steep", "the gradient far from 1", "The gradient should be as far from 1 as possible.", "si"),
  ],
};
export const sameOnBothRulers = family<T>("same-on-both-rulers", "Same on Both Rulers", ["mach", "si"], rulersShape, [{ T: 6 }], (ctx, p) => {
  const fRef = ref("mach", "fixed");
  const fv = ctx.read(fRef);
  const f = num(fv);
  if (f === null) return allUndefined(ctx, rulersShape, fv, fRef);
  const mRef = ref("si", "m");
  const m = num(ctx.read(mRef))!;
  ctx.term("fixed", `distance from the unchanged number to ${p.T}`, gap(f, q(p.T)), [fRef]);
  ctx.term("m-spf", "the gradient's smallest prime factor", spfQ(m), [mRef]);
  ctx.term("m-gpf", "the gradient's largest prime factor", gpfQ(m), [mRef]);
  ctx.term("steep", "|m − 1|", gap(m, Qn.ONE), [mRef]);
  ctx.mark({ kind: "focus", ref: fRef });
});

// ---------------------------------------------------------------- 8. Whole Crossing (the curator's §10.5)

const crossingShape: Shape<object> = {
  main: distance("crossing", "the x-axis crossing close to a whole number", "The line should cross the x-axis as close as possible to a whole number.", "crossing"),
  tieBreakers: [
    more("k-spf", "that whole number's smallest prime factor", "That whole number's smallest prime factor should be as big as possible.", "crossing"),
    more("k-gpf", "that whole number's largest prime factor", "That whole number's largest prime factor should be as big as possible.", "crossing"),
    factorTies<object>("m", "the gradient")[0]!,
  ],
};
export const wholeCrossing = family("whole-crossing", "Whole Crossing", ["crossing", "si", "cart"], crossingShape, [{}], ctx => {
  const xRef = ref("crossing", "x0"), kRef = ref("crossing", "near"), mRef = ref("si", "m");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, crossingShape, xv, xRef);   // a flat line never crosses (or lies along the axis)
  const k = num(ctx.read(kRef))!;   // the whole number nearest the crossing (a half rounds up)
  ctx.term("crossing", `distance from the crossing ${Qn.toWire(x)} to ${Qn.toWire(k)}`, gap(x, k), [xRef, kRef]);
  ctx.term("k-spf", `smallest prime factor of ${Qn.toWire(k)}`, spfQ(k), [kRef]);
  ctx.term("k-gpf", `largest prime factor of ${Qn.toWire(k)}`, gpfQ(k), [kRef]);
  // A vertical line crosses at x0 but has no gradient: its m-spf is undefined (it ranks last), not its crossing.
  const mv = ctx.read(mRef), m = num(mv);
  ctx.term("m-spf", "the gradient's smallest prime factor", m === null ? undef(mv) : spfQ(m), [mRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "candidate", ref: kRef, term: "crossing" });
  // The nearest whole number on the x-axis, so the plane can draw the target (marks only).
  const km = ref("cart", "xAxisMark", { x: k });
  ctx.read(km);
  ctx.mark({ kind: "candidate", ref: km, term: "crossing" });
});

// ---------------------------------------------------------------- 9. Divisibility Ladder (the curator's §10.5; D §11)

const ladderShape: Shape<object> = {
  main: more("ladder", "a run of n dividing y(n)", "y(1) should be a multiple of 1, y(2) a multiple of 2, y(3) of 3, and so on (the line not through (0, 0)): the run should be as long as possible.", "table"),
  tieBreakers: [
    ...factorTies<object>("m", "the gradient"),
    more("steep", "the gradient steep", "The gradient should be as steep as possible.", "si"),
    distance("m-prime", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si"),
  ],
};
export const divisibilityLadder = family("divisibility-ladder", "Divisibility Ladder", ["table", "si"], ladderShape, [{}], ctx => {
  const mRef = ref("si", "m"), cRef = ref("si", "c");
  const cv = ctx.read(cRef), c = num(cv);
  if (c === null) return allUndefined(ctx, ladderShape, cv, cRef);   // a vertical line has no y(n)
  if (Qn.isZero(c)) return allUndefined(ctx, ladderShape, { kind: "undefined", reason: "the line goes through (0, 0), where every n divides y(n): the rule wants a line that does not" }, cRef);
  const m = num(ctx.read(mRef))!;
  let run = 0;
  const cols: ElementRef[] = [];
  for (let n = 1; n <= 12; n++) {
    const r = ref("table", "q", { x: n }); // y(n) ÷ n
    const yn = num(ctx.read(r))!;
    if (yn.d !== 1n) { ctx.mark({ kind: "note", ref: r, text: `${n} does not divide y(${n}): the run stops here` }); break; }
    run++;
    cols.push(r);
    ctx.mark({ kind: "focus", ref: r });
  }
  ctx.term("ladder", "the run of n dividing y(n)", q(run), cols.length ? cols : [cRef]);
  ctx.term("m-spf", "the gradient's smallest prime factor", spfQ(m), [mRef]);
  ctx.term("m-gpf", "the gradient's largest prime factor", gpfQ(m), [mRef]);
  ctx.term("steep", "|m|", Qn.abs(m), [mRef]);
  ctx.term("m-prime", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
});

/** The beginner families of this file; the dealt pool (presets.ts) adds Prime Gradient from families.ts. */
export const beginnerFamilies = [primeStaircase, squareArea, wholeCrossing, divisibilityLadder, treasure, primeLanding, sameOnBothRulers] as const;
