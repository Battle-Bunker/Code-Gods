/**
 * The beginner pool (docs/engine-v2/layered-line-rules.md §8, the curator's list): eight families, each a main layer a
 * 12-year-old on a standard linear-equations course can read, and the curator's dealable tie-breakers. Definitions
 * follow docs/engine-v2/scripts/line-families.mjs (BEGINNER); every layer is graded (owner decision 13). A dealt rule
 * is the main layer plus one tie-breaker (decision 14 and its clarification).
 */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { distanceToPrime, distanceToWhole, isPrime, largestPrimeFactor, nearbyPrimes, nearestSquareRoot, primeFactorCount, primesBetween, smallestPrimeFactor } from "./numbers.ts";

type Ctx = EvalContext<LineState>;
type L<P> = Layer<P>;

const ds = (...xs: string[]): Q[] => xs.map(x => Qn.parse(x));
const ns = (...xs: number[]): Q[] => xs.map(x => q(x));
const fracs = (...xs: [number, number][]): Q[] => xs.map(([n, d]) => q(n, d));
/** One rung per prime from lo to hi (curator, #385). */
const primes = (lo: number, hi: number): Q[] => primesBetween(lo, hi).map(p => q(p));
const upTo = (k: number): Q[] => Array.from({ length: k }, (_, i) => q(i + 1));
const within = (what: string) => (t: Q) => (Qn.isZero(t) ? `${what} exactly` : `${what} within ${Qn.toWire(t)}`);
const atLeast = (what: string) => (t: Q) => `${what} at least ${Qn.toWire(t)}`;

/** A distance layer: smaller is better, thresholds easiest first. */
function distance<P>(id: string, title: string, sentence: string, rep: string, thresholds: Q[], what: string): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "min", measure: "distance", thresholds: () => thresholds, rungLabel: within(what) };
}
/** A count or size layer: bigger is better. */
function more<P>(id: string, title: string, sentence: string, rep: string, thresholds: Q[], what: string, measure: "count" | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max", measure, thresholds: () => thresholds, rungLabel: atLeast(what) };
}

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
  main: more("run", "a run of different primes from y(0)", "The pattern y(0), y(1), y(2), … should start with as long a run of different primes as possible.", "seq", upTo(6), "a run of primes", "count"),
  tieBreakers: [
    more("first-prime", "the first prime", "The first prime should be as big as possible.", "seq", primes(3, 31), "y(0)"),
    more("last-prime", "the last prime of the run", "The last prime of the run should be as big as possible.", "seq", primes(5, 47), "the last prime"),
    distance("near-miss", "the first non-prime term close to a prime", "The first term that is not prime should be as close as possible to a prime.", "seq", ds("8", "4", "2", "1", "1/2", "1/4", "1/8"), "the first miss to a prime"),
    distance("step-back", "y(−1) close to a prime", "The term before the start, y(−1), should be as close as possible to a prime.", "seq", ds("4", "2", "1", "1/2", "1/4", "0"), "y(−1) to a prime"),
  ],
};
export const primeStaircase = family("prime-staircase", "Prime Staircase", ["seq", "si"], staircase, [{}], ctx => {
  const first = ref("seq", "term", { n: 0 });
  const v0 = ctx.read(first);
  if (num(v0) === null) return allUndefined(ctx, staircase, v0, first);
  const seen = new Set<bigint>();
  let run = 0;
  let miss: { ref: ElementRef; v: Q } | null = null;
  for (let n = 0; n < 12; n++) {
    const r = ref("seq", "term", { n });
    const v = num(ctx.read(r))!;
    if (v.d !== 1n || !isPrime(v.n) || seen.has(v.n)) { miss = { ref: r, v }; break; }
    seen.add(v.n);
    run++;
    ctx.mark({ kind: "focus", ref: r });
  }
  const back = ref("seq", "term", { n: -1 });
  const vb = num(ctx.read(back))!;
  const terms = Array.from({ length: run }, (_, n) => ref("seq", "term", { n }));
  ctx.term("run", "different primes from y(0)", q(run), terms.length ? terms : [first]);
  ctx.term("first-prime", "y(0)", num(v0)!, [first]);
  ctx.term("last-prime", "the last prime of the run", run ? q([...seen][run - 1]!) : Qn.ZERO, terms.length ? [terms[run - 1]!] : [first]);
  ctx.term("near-miss", "distance from the first non-prime term to a prime", miss ? distanceToPrime(Qn.abs(miss.v)) : { undefined: "the first twelve terms are all different primes" }, miss ? [miss.ref] : [first]);
  ctx.term("step-back", "distance from y(−1) to a prime", distanceToPrime(Qn.abs(vb)), [back]);
  if (miss) ctx.mark({ kind: "note", ref: miss.ref, text: "the run stops here" });
});

// ---------------------------------------------------------------- 2. Square Area (the owner's example 2)

const squareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line cuts off the axes should have an area as close as possible to a square number.", "tri", ds("8", "4", "2", "1", "1/2", "1/4", "1/8", "1/16", "0"), "the area to a square"),
  tieBreakers: [
    more("root-spf", "that square's root's smallest prime factor", "The smallest prime factor of that square's root should be as big as possible.", "tri", primes(2, 31), "the root's smallest prime factor"),
    more("root-lpf", "that square's root's largest prime factor", "The largest prime factor of that square's root should be as big as possible.", "tri", primes(2, 31), "the root's largest prime factor"),
    more("root-factors", "prime factors of that square's root", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "tri", upTo(7), "prime factors of the root", "count"),
    distance("slanted-square", "the slanted side squared close to a square", "The slanted side, squared, should be as close as possible to a square number.", "tri", ds("16", "8", "4", "2", "1", "1/2", "0"), "side² to a square"),
  ],
};
export const squareArea = family("square-area", "Square Area", ["tri", "cart"], squareShape, [{}], ctx => {
  const area = ref("tri", "area"), hyp = ref("tri", "hyp2");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, squareShape, av, area);
  const h = num(ctx.read(hyp))!;
  const sq = squareGap(a), hs = squareGap(h);
  ctx.term("square", `distance from the area to ${sq.root * sq.root}`, sq.d, [area]);
  ctx.term("root-spf", `smallest prime factor of ${sq.root}`, q(smallestPrimeFactor(sq.root)), [area]);
  ctx.term("root-lpf", `largest prime factor of ${sq.root}`, q(largestPrimeFactor(sq.root)), [area]);
  ctx.term("root-factors", `prime factors of ${sq.root}`, q(primeFactorCount(sq.root)), [area]);
  ctx.term("slanted-square", `distance from side² to ${hs.root * hs.root}`, hs.d, [hyp]);
  ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, nearest square ${sq.root * sq.root} = ${sq.root}²` });
});

// ---------------------------------------------------------------- 3. Treasure

type KT = { k: number; T: number };
const treasureShape: Shape<KT> = {
  main: { ...distance<KT>("treasure", "y(k) close to T", "", "table", ds("32", "16", "8", "4", "2", "1", "1/2", "1/4", "0"), "y(k) to T"),
    sentence: p => `When x is ${p.k}, y should be as close as possible to ${p.T}.` },
  tieBreakers: [
    more("prime-terms", "different primes among y(1) … y(8)", "As many as possible of y(1) … y(8) should be different primes.", "table", upTo(8), "different primes", "count"),
    distance("prime-gradient", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si", ds("4", "2", "1", "1/2", "1/4", "0"), "m to a prime"),
    distance("square-start", "the y-intercept close to a square", "The y-intercept should be as close as possible to a square number.", "si", ds("8", "4", "2", "1", "1/2", "0"), "c to a square"),
  ],
};
export const treasure = family<KT>("treasure", "Treasure", ["table", "si"], treasureShape, [{ k: 2, T: 37 }], (ctx, p) => {
  const at = ref("table", "y", { x: p.k });
  const v = ctx.read(at);
  const y = num(v);
  if (y === null) return allUndefined(ctx, treasureShape, v, at);
  const m = num(ctx.read(ref("si", "m")))!, c = num(ctx.read(ref("si", "c")))!;
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
  ctx.term("prime-gradient", "distance from the gradient to a prime", distanceToPrime(m), [ref("si", "m")]);
  ctx.term("square-start", "distance from the y-intercept to a square", squareGap(c).d, [ref("si", "c")]);
  ctx.mark({ kind: "focus", ref: at });
});

// ---------------------------------------------------------------- 4. Ruler

const rulerShape: Shape<object> = {
  main: distance("ruler", "distance² from (0, 0) close to a square", "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number.", "norm", ds("8", "4", "2", "1", "1/2", "1/4", "1/8", "1/16", "0"), "distance² to a square"),
  tieBreakers: [
    more("far", "that whole distance", "That distance should be as big as possible.", "norm", ns(2, 3, 4, 5, 6, 8, 10, 12), "the distance"),
    distance("prime-gradient", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si", ds("4", "2", "1", "1/2", "1/4", "0"), "m to a prime"),
    distance("square-area", "the triangle's area close to a square", "The triangle cut off the axes should have an area as close as possible to a square number.", "tri", ds("8", "4", "2", "1", "1/2", "1/4", "0"), "the area to a square"),
  ],
};
export const ruler = family("ruler", "Ruler", ["norm", "si", "tri"], rulerShape, [{}], ctx => {
  const mRef = ref("si", "m"), d2Ref = ref("norm", "dist2"), area = ref("tri", "area");
  const mv = ctx.read(mRef);
  const m = num(mv);
  if (m === null || Qn.isZero(m)) return allUndefined(ctx, rulerShape, m === null ? mv : { kind: "undefined", reason: "a flat line's distance is its height: the rule wants a sloping line" }, mRef);
  const d2 = num(ctx.read(d2Ref))!;
  ctx.read(ref("norm", "foot"));
  // The nearest square k² with k ≥ 1.
  let k = nearestSquareRoot(d2);
  if (k === 0n) k = 1n;
  const av = ctx.read(area);
  ctx.term("ruler", `distance from distance² to ${k * k}`, gap(d2, q(k * k)), [d2Ref]);
  ctx.term("far", "the whole distance nearest", q(k), [d2Ref]);
  ctx.term("prime-gradient", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
  ctx.term("square-area", "distance from the area to a square", num(av) === null ? undef(av) : squareGap(num(av)!).d, [area]);
  ctx.mark({ kind: "focus", ref: ref("norm", "foot") });
  ctx.mark({ kind: "note", ref: d2Ref, text: `distance² ${Qn.toWire(d2)}, nearest square ${k * k}` });
});

// ---------------------------------------------------------------- 5. Exact Change

type W = { ways: number };
const changeShape: Shape<W> = {
  main: { ...distance<W>("change", "ways to pay close to the target", "", "coins", ds("5", "4", "3", "2", "1", "0"), "the ways to the target"),
    sentence: p => `Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to ${p.ways}.` },
  tieBreakers: [
    more("big-piles", "the smaller pile in every way", "In every way to pay, the smaller pile should be as big as possible.", "coins", ns(0, 1, 2, 3, 4, 5), "the smaller pile"),
    more("big-bill", "the bill", "The bill N should be as big as possible.", "gen", ns(10, 15, 20, 30, 45, 60, 90), "the bill"),
    distance("prime-coins", "both coins close to primes", "Both coin values should be as close as possible to primes (distances added).", "gen", ds("4", "3", "2", "1", "0"), "the coins to primes"),
  ],
};
export const exactChange = family<W>("exact-change", "Exact Change", ["coins", "gen"], changeShape, [{ ways: 6 }], (ctx, p) => {
  const ways = ref("coins", "ways"), bill = ref("coins", "bill"), pile = ref("coins", "smallestPile");
  const wv = ctx.read(ways);
  const w = num(wv);
  if (w === null) return allUndefined(ctx, changeShape, wv, ways);
  const N = num(ctx.read(bill))!, pv = ctx.read(pile);
  const a = num(ctx.read(ref("gen", "a")))!, b = num(ctx.read(ref("gen", "b")))!;
  ctx.term("change", `distance from the ways to pay to ${p.ways}`, gap(w, q(p.ways)), [ways]);
  ctx.term("big-piles", "the smaller pile, at its smallest", num(pv) ?? undef(pv), [pile]);
  ctx.term("big-bill", "the bill", N, [bill]);
  ctx.term("prime-coins", "distance of the coins from primes", Qn.add(distanceToPrime(a), distanceToPrime(b)), [ref("gen", "a"), ref("gen", "b")]);
  ctx.mark({ kind: "focus", ref: ways });
  ctx.mark({ kind: "note", ref: bill, text: `pay ${Qn.toWire(N)} with coins of ${Qn.toWire(a)} and ${Qn.toWire(b)}: ${Qn.toWire(w)} ways` });
});

// ---------------------------------------------------------------- 6. Prime Landing (the owner's example 1, regraded)

const landingShape: Shape<object> = {
  main: distance("landing", "the y-intercept close to a prime", "The y-intercept should be as close as possible to a prime number.", "si", ds("4", "2", "1", "1/2", "1/4", "1/8", "0"), "c to a prime"),
  tieBreakers: [
    more("big-prime", "that prime", "That prime should be as big as possible.", "si", primes(2, 31), "the prime"),
    distance("prime-gradient", "the gradient close to a prime too", "The gradient should be as close as possible to a prime too.", "si", ds("4", "2", "1", "1/2", "1/4", "0"), "m to a prime"),
    distance("next-prime", "y(1) close to a prime too", "y(1) = m + c should be as close as possible to a prime too.", "table", ds("4", "2", "1", "1/2", "1/4", "0"), "y(1) to a prime"),
  ],
};
export const primeLanding = family("prime-landing", "Prime Landing", ["si", "cart", "table"], landingShape, [{}], ctx => {
  const cRef = ref("si", "c"), mRef = ref("si", "m"), y1 = ref("table", "y", { x: 1 });
  const cv = ctx.read(cRef);
  const c = num(cv);
  if (c === null) return allUndefined(ctx, landingShape, cv, cRef);
  const m = num(ctx.read(mRef))!, v1 = num(ctx.read(y1))!;
  const p = nearbyPrimes(c)[0]!;
  const mark = ref("cart", "yAxisMark", { y: p });
  ctx.read(mark);
  ctx.term("landing", `distance from the y-intercept to ${p}`, gap(c, q(p)), [cRef]);
  ctx.term("big-prime", "that prime", q(p), [cRef]);
  ctx.term("prime-gradient", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
  ctx.term("next-prime", "distance from y(1) to a prime", distanceToPrime(Qn.abs(v1)), [y1]);
  ctx.mark({ kind: "focus", ref: cRef });
  ctx.mark({ kind: "candidate", ref: mark, term: "landing" });
});

// ---------------------------------------------------------------- 7. Same on Both Rulers

type T = { T: number };
const rulersShape: Shape<T> = {
  main: { ...distance<T>("fixed", "the unchanged number close to T", "", "mach", ds("16", "8", "4", "2", "1", "1/2", "1/4", "0"), "the unchanged number to T"),
    sentence: p => `The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to ${p.T}.` },
  tieBreakers: [
    more("steep", "the gradient far from 1", "The gradient should be as far from 1 as possible.", "si", fracs([1, 4], [1, 2], [1, 1], [2, 1], [3, 1], [5, 1], [8, 1]), "|m − 1|"),
    distance("prime-start", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si", ds("4", "2", "1", "1/2", "0"), "|c| to a prime"),
    more("whole-values", "different whole numbers among y(−5) … y(5)", "As many of y(−5) … y(5) as possible should be different whole numbers.", "table", upTo(11), "different whole values", "count"),
    distance("whole-lamp", "the lamp's height close to whole", "The lamp's height m/(m − 1) should be as close as possible to a whole number.", "mach", ds("1/2", "1/4", "1/8", "1/16", "0"), "the lamp to whole"),
  ],
};
export const sameOnBothRulers = family<T>("same-on-both-rulers", "Same on Both Rulers", ["mach", "si", "table"], rulersShape, [{ T: 6 }], (ctx, p) => {
  const fRef = ref("mach", "fixed");
  const fv = ctx.read(fRef);
  const f = num(fv);
  if (f === null) return allUndefined(ctx, rulersShape, fv, fRef);
  const m = num(ctx.read(ref("si", "m")))!, c = num(ctx.read(ref("si", "c")))!;
  const lamp = ref("mach", "lamp");
  const lv = num(ctx.read(lamp))!;
  const whole = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = -5; x <= 5; x++) {
    const r = ref("table", "y", { x });
    const t = num(ctx.read(r))!;
    cols.push(r);
    if (t.d === 1n) whole.add(t.n);
  }
  ctx.term("fixed", `distance from the unchanged number to ${p.T}`, gap(f, q(p.T)), [fRef]);
  ctx.term("steep", "|m − 1|", gap(m, Qn.ONE), [ref("si", "m")]);
  ctx.term("prime-start", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [ref("si", "c")]);
  ctx.term("whole-values", "different whole values among y(−5) … y(5)", q(whole.size), cols);
  ctx.term("whole-lamp", "distance from the lamp's height to whole", distanceToWhole(lv), [lamp]);
  ctx.mark({ kind: "focus", ref: fRef });
});

// ---------------------------------------------------------------- 8. Pythagorean Area (the owner's rule 2)

type A = { A: number };
const pythShape: Shape<A> = {
  main: { ...distance<A>("area", "the area close to A", "", "tri", ds("16", "8", "4", "2", "1", "1/2", "1/4", "0"), "the area to A"),
    sentence: p => `The triangle the line cuts off the axes should have an area as close as possible to ${p.A}.` },
  tieBreakers: [
    distance("slanted-square", "the slanted side squared close to a square", "The slanted side, squared, should be as close as possible to a square number.", "tri", ds("16", "8", "4", "2", "1", "1/2", "0"), "side² to a square"),
    distance("prime-height", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si", ds("4", "2", "1", "1/2", "0"), "|c| to a prime"),
    distance("whole-legs", "both legs close to whole numbers", "Both legs should be as close as possible to whole numbers (distances added).", "tri", ds("1/2", "1/4", "1/8", "1/16", "0"), "the legs to whole"),
  ],
};
export const pythagoreanArea = family<A>("pythagorean-area", "Pythagorean Area", ["tri", "si"], pythShape, [{ A: 6 }], (ctx, p) => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, pythShape, av, area);
  const hyp = ref("tri", "hyp2"), lx = ref("tri", "legX"), ly = ref("tri", "legY"), cRef = ref("si", "c");
  const h = num(ctx.read(hyp))!, x = num(ctx.read(lx))!, y = num(ctx.read(ly))!, c = num(ctx.read(cRef))!;
  ctx.term("area", `distance from the area to ${p.A}`, gap(a, q(p.A)), [area]);
  ctx.term("slanted-square", "distance from side² to a square", squareGap(h).d, [hyp]);
  ctx.term("prime-height", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [cRef]);
  ctx.term("whole-legs", "distance of the legs from whole numbers", Qn.add(distanceToWhole(x), distanceToWhole(y)), [lx, ly]);
  ctx.mark({ kind: "focus", ref: lx });
  ctx.mark({ kind: "focus", ref: ly });
});

export const beginnerFamilies = [primeStaircase, squareArea, treasure, ruler, exactChange, primeLanding, sameOnBothRulers, pythagoreanArea] as const;
