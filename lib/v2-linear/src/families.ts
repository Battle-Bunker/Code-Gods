/**
 * Rule families (spec §12.5). Each is a ladder of layers (owner decisions 12–14): a primary in school-textbook terms
 * (gradient, intercepts, substitution, table of values) and one graded secondary that counts once the primary is at its
 * top. Every layer is a distance, a count or a size, never a yes/no test.
 */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type Undef, type Variant } from "@workspace/v2-core";
import { lineParams, type LineState } from "./line.ts";
import { nearbyPrimes, nearestInteger, nearestSquareRoot, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

type Ctx = EvalContext<LineState>;
type L<P> = Layer<P>;

const Z_DIST = [13, 8, 5, 3, 2, 1, 0].map(d => q(d));
const Q_DIST = [q(8), q(4), q(2), q(1), q(1, 2), q(1, 4), q(1, 8), q(0)];
/** Distance thresholds on the variant's domain. */
const distances = (v: Variant): readonly Q[] => (lineParams(v).domain === "Z" ? Z_DIST : Q_DIST);
const within = (what: string) => (t: Q) => (Qn.isZero(t) ? `${what} exactly` : `${what} within ${Qn.toWire(t)}`);
const atLeast = (what: string) => (t: Q) => `${what} at least ${Qn.toWire(t)}`;
const atMost = (what: string) => (t: Q) => (Qn.isZero(t) ? `${what} 0` : `${what} at most ${Qn.toWire(t)}`);
const qs = (xs: readonly number[]) => xs.map(x => q(x));

const undef = (v: ElementValue): Undef => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));

/** Record every layer as undefined (the primary's input does not exist for this line) and say why. */
function allUndefined(ctx: Ctx, layers: readonly L<any>[], why: ElementValue, from: ElementRef): void {
  for (const l of layers) ctx.term(l.id, l.title, undef(why), [from]);
  ctx.mark({ kind: "note", ref: from, text: undef(why).undefined });
}

// ---------------------------------------------------------------- 1. Prime Gradient (owner)

const pgLayers: readonly L<object>[] = [
  { id: "near", title: "gradient close to a prime", sentence: () => "Make the gradient as close as possible to a prime number.",
    rep: "si", sense: "min", measure: "distance", thresholds: (_p, v) => distances(v), rungLabel: within("gradient to a prime") },
  { id: "prime", title: "the size of that prime", sentence: () => "Tie-breaker: the bigger that prime, the better.",
    rep: "si", sense: "max", measure: "size", thresholds: () => qs([3, 5, 7, 11, 13, 17, 19, 23]), rungLabel: atLeast("the prime") },
];

export const primeGradient: RuleFamily<LineState, object> = {
  id: "prime-gradient", title: "Prime Gradient",
  card: () => "Make the gradient as close as possible to a prime number; then, the bigger that prime the better.",
  params: [], dealable: () => [{}],
  depends: ["si", "cart"], primary: "si", layers: pgLayers,
  evaluate(ctx) {
    const mRef = ref("si", "m");
    const mv = ctx.read(mRef);
    const m = num(mv);
    if (m === null) return allUndefined(ctx, pgLayers, mv, mRef);
    const primes = nearbyPrimes(m);
    for (const p of primes) {
      const g = ref("cart", "ghost", { g: p });
      ctx.read(g);
      ctx.term(`d${p}`, `distance to ${p}`, gap(m, q(p)), [mRef]);
      ctx.mark({ kind: "candidate", ref: g, term: `d${p}` });
    }
    const p = primes[0]!;
    ctx.term("near", "distance from the gradient to the nearest prime", gap(m, q(p)), [mRef]);
    ctx.term("prime", "that prime", q(p), [mRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "note", ref: mRef, text: `nearest prime ${p}` });
  },
};

// ---------------------------------------------------------------- 2. Triangle Area (owner)

const taLayers: readonly L<{ A: number }>[] = [
  { id: "area", title: "triangle area close to A", sentence: p => `The line and the two axes make a triangle; make its area as close as possible to ${p.A}.`,
    rep: "tri", sense: "min", measure: "distance", thresholds: (_p, v) => distances(v), rungLabel: within("the area") },
  { id: "legs", title: "legs nearly whole", sentence: () => "Tie-breaker: the triangle's two legs should be whole numbers, or fractions with bottom numbers as small as possible.",
    rep: "tri", sense: "min", measure: "distance", thresholds: () => qs([12, 8, 6, 4, 3, 2, 1, 0]), rungLabel: atMost("the legs' bottom numbers − 2") },
];

export const triangleArea: RuleFamily<LineState, { A: number }> = {
  id: "triangle-area", title: "Triangle Area",
  card: p => `Make the triangle between the line and the axes have area as close to ${p.A} as you can; then make its legs as nearly whole as you can.`,
  params: [{ name: "A", domain: "Z" }], dealable: () => [4, 6, 8, 12, 18].map(A => ({ A })),
  depends: ["tri", "cart", "si"], primary: "tri", layers: taLayers,
  evaluate(ctx, p) {
    const area = ref("tri", "area"), lx = ref("tri", "legX"), ly = ref("tri", "legY");
    const av = ctx.read(area);
    const a = num(av);
    if (a === null) return allUndefined(ctx, taLayers, av, area);
    const x = num(ctx.read(lx))!, y = num(ctx.read(ly))!;
    ctx.term("area", `distance from the area to ${p.A}`, gap(a, q(p.A)), [area]);
    ctx.term("legs", "the legs' bottom numbers − 2", q(x.d + y.d - 2n), [lx, ly]);
    ctx.mark({ kind: "focus", ref: lx });
    ctx.mark({ kind: "focus", ref: ly });
    ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, target ${p.A}` });
  },
};

// ---------------------------------------------------------------- 3. m Meets c (owner)

const mcLayers: readonly L<object>[] = [
  { id: "gap", title: "gradient close to the y-intercept", sentence: () => "Make the gradient and the y-intercept as close as possible to each other.",
    rep: "si", sense: "min", measure: "distance", thresholds: (_p, v) => distances(v), rungLabel: within("m and c") },
  { id: "size", title: "they meet at a big number", sentence: () => "Tie-breaker: the bigger the y-intercept (ignoring its sign), the better.",
    rep: "si", sense: "max", measure: "size", thresholds: () => qs([1, 2, 3, 4, 6, 8, 12, 16, 24]), rungLabel: atLeast("|c|") },
];

export const mMeetsC: RuleFamily<LineState, object> = {
  id: "m-meets-c", title: "m Meets c",
  card: () => "Make the gradient and the y-intercept as close as possible to each other; then, the bigger they are the better.",
  params: [], dealable: () => [{}],
  depends: ["si", "cart"], primary: "si", layers: mcLayers,
  evaluate(ctx) {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), cv = ctx.read(cRef);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) return allUndefined(ctx, mcLayers, m === null ? mv : cv, m === null ? mRef : cRef);
    ctx.term("gap", "distance between m and c", gap(m, c), [mRef, cRef]);
    ctx.term("size", "the size of c", Qn.abs(c), [cRef]);
    // |m − c| is the line's height at x = −1: every perfect line passes through (−1, 0).
    const at = ref("cart", "pointAtX", { q: -1 });
    ctx.read(at);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
    ctx.mark({ kind: "candidate", ref: at, term: "gap" });
    ctx.mark({ kind: "note", ref: at, text: "m − c is the line's height at x = −1" });
  },
};

// ---------------------------------------------------------------- 4. Crossing Check (owner)

const ccLayers: readonly L<{ k: number; q: number }>[] = [
  { id: "gap", title: "y(k) close to x(q)", sentence: p => `Make y(${p.k}) and x(${p.q}) as close as possible: y(${p.k}) is the height at x = ${p.k}, x(${p.q}) is where the line reaches height ${p.q}.`,
    rep: "mach", sense: "min", measure: "distance", thresholds: (_p, v) => distances(v), rungLabel: within("y(k) to x(q)") },
  { id: "size", title: "they cross at a big number", sentence: p => `Tie-breaker: the bigger x(${p.q}) is (ignoring its sign), the better.`,
    rep: "mach", sense: "max", measure: "size", thresholds: () => qs([1, 2, 3, 4, 6, 8, 12, 16, 24]), rungLabel: atLeast("|x(q)|") },
];

export const crossingCheck: RuleFamily<LineState, { k: number; q: number }> = {
  id: "crossing-check", title: "Crossing Check",
  card: p => `Make y(${p.k}) and x(${p.q}) as close as possible; then make them meet at as big a number as you can.`,
  params: [{ name: "k", domain: "Z" }, { name: "q", domain: "Z" }],
  dealable: () => [1, 2, 3].flatMap(k => [2, 4, 6].map(qq => ({ k, q: qq }))),
  depends: ["mach", "cart"], primary: "mach", layers: ccLayers,
  evaluate(ctx, p) {
    const out = ref("mach", "out", { q: p.k }), rev = ref("mach", "reverse", { q: p.q });
    const ov = ctx.read(out), rv = ctx.read(rev);
    const y = num(ov), x = num(rv);
    if (y === null || x === null) return allUndefined(ctx, ccLayers, y === null ? ov : rv, y === null ? out : rev);
    ctx.term("gap", `distance between y(${p.k}) and x(${p.q})`, gap(y, x), [out, rev]);
    ctx.term("size", `the size of x(${p.q})`, Qn.abs(x), [rev]);
    const atX = ref("cart", "pointAtX", { q: p.k }), atY = ref("cart", "pointAtY", { q: p.q });
    ctx.read(atX); ctx.read(atY);
    ctx.mark({ kind: "focus", ref: out });
    ctx.mark({ kind: "focus", ref: rev });
    ctx.mark({ kind: "candidate", ref: atX });
    ctx.mark({ kind: "candidate", ref: atY });
  },
};

// ---------------------------------------------------------------- 5. Whole Intercept (owner decision 12, first example)

const wiLayers: readonly L<object>[] = [
  { id: "frac", title: "y-intercept close to a whole number", sentence: () => "Make the y-intercept as close as possible to a whole number.",
    rep: "si", sense: "min", measure: "distance", thresholds: () => [q(1, 3), q(1, 4), q(1, 6), q(1, 8), q(1, 12), q(1, 16), q(0)], rungLabel: within("c to a whole number") },
  { id: "spf", title: "smallest prime factor of that whole number", sentence: () => "Tie-breaker: the bigger the smallest prime factor of that whole number, the better.",
    rep: "si", sense: "max", measure: "size", thresholds: () => qs([2, 3, 5, 7, 11, 13, 17, 19]), rungLabel: atLeast("its smallest prime factor") },
];

export const wholeIntercept: RuleFamily<LineState, object> = {
  id: "whole-intercept", title: "Whole Intercept",
  card: () => "Make the y-intercept as close as possible to a whole number; then make that number's smallest prime factor as big as you can.",
  params: [], dealable: () => [{}],
  depends: ["si", "cart"], primary: "si", layers: wiLayers,
  evaluate(ctx) {
    const cRef = ref("si", "c");
    const cv = ctx.read(cRef);
    const c = num(cv);
    if (c === null) return allUndefined(ctx, wiLayers, cv, cRef);
    const n = nearestInteger(c);
    const mark = ref("cart", "yAxisMark", { y: n });
    ctx.read(mark);
    ctx.term("frac", `distance from c to ${n}`, gap(c, q(n)), [cRef]);
    ctx.term("spf", `smallest prime factor of ${n}`, q(smallestPrimeFactor(n)), [cRef]);
    ctx.mark({ kind: "focus", ref: cRef });
    ctx.mark({ kind: "candidate", ref: mark, term: "frac" });
  },
};

// ---------------------------------------------------------------- 6. Square Area (owner decision 12, second example)

const saLayers: readonly L<object>[] = [
  { id: "square", title: "triangle area close to a square number", sentence: () => "The line and the axes make a triangle; make its area as close as possible to a square number.",
    rep: "tri", sense: "min", measure: "distance", thresholds: (_p, v) => distances(v), rungLabel: within("the area to a square") },
  { id: "factors", title: "prime factors of that square's root", sentence: () => "Tie-breaker: the more prime factors the square's root has (counting repeats), the better.",
    rep: "tri", sense: "max", measure: "count", thresholds: () => qs([1, 2, 3, 4, 5, 6]), rungLabel: atLeast("prime factors of the root") },
];

export const squareArea: RuleFamily<LineState, object> = {
  id: "square-area", title: "Square Area",
  card: () => "Make the area of the triangle between the line and the axes as close as possible to a square number; then give that square's root as many prime factors as you can.",
  params: [], dealable: () => [{}],
  depends: ["tri", "cart"], primary: "tri", layers: saLayers,
  evaluate(ctx) {
    const area = ref("tri", "area");
    const av = ctx.read(area);
    const a = num(av);
    if (a === null) return allUndefined(ctx, saLayers, av, area);
    const r = nearestSquareRoot(a);
    ctx.term("square", `distance from the area to ${r * r}`, gap(a, q(r * r)), [area]);
    ctx.term("factors", `prime factors of ${r}`, q(primeFactorCount(r)), [area]);
    ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, nearest square ${r * r} = ${r}²` });
  },
};

export const families = [primeGradient, triangleArea, mMeetsC, crossingCheck, wholeIntercept, squareArea] as const;
