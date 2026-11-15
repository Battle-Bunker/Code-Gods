/**
 * Rule families (spec §12.5). Each has a main layer in school-textbook terms (gradient, intercepts, substitution, table
 * of values) and a list of alternative tie-breakers (owner decisions 12–14): a dealt rule is the main layer plus one
 * of them. Every layer is a distance, a count or a size, never a yes/no test (decision 13).
 */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { largestPrimeFactor, nearbyPrimes, smallestPrimeFactor } from "./numbers.ts";
import { beginnerFamilies, factorLabel } from "./beginner.ts";
import { rationalFamilies } from "./rational.ts";
import { rational2Families } from "./rational2.ts";

type Ctx = EvalContext<LineState>;
type L<P> = Layer<P>;

const undef = (v: ElementValue): Undef => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));
const primeGap = (x: Q): { p: bigint; d: Q } => { const p = nearbyPrimes(x)[0]!; return { p, d: gap(x, q(p)) }; };

/** Record the main layer and every tie-breaker as undefined (the main layer's input does not exist) and say why. */
function allUndefined<P>(ctx: Ctx, f: { main: L<P>; tieBreakers: readonly L<P>[] }, why: ElementValue, from: ElementRef): void {
  for (const l of [f.main, ...f.tieBreakers]) ctx.term(l.id, l.title, undef(why), [from]);
  ctx.mark({ kind: "note", ref: from, text: undef(why).undefined });
}
/** The card: the main layer's sentence, then the dealt tie-breaker's. */
function card<P>(f: { main: L<P>; tieBreakers: readonly L<P>[] }, p: P, tb: TieBreaker): string {
  const t = tb === null ? undefined : f.tieBreakers.find(x => x.id === tb);
  return t ? `${f.main.sentence(p)} ${t.sentence(p)}` : f.main.sentence(p);
}

// ---------------------------------------------------------------- 1. Prime Gradient (owner)

const pg = {
  main: { id: "near", title: "gradient close to a prime", sentence: () => "Make the gradient as close as possible to a prime number.",
    rep: "si", sense: "min" } as L<object>,
  tieBreakers: [
    { id: "prime", title: "the size of that prime", sentence: () => "Tie-breaker: the bigger that prime, the better.",
      rep: "si", sense: "max" },
    { id: "cPrime", title: "the y-intercept close to a prime too", sentence: () => "Tie-breaker: make the y-intercept as close as possible to a prime too.",
      rep: "si", sense: "min" },
    { id: "c-spf", title: "the y-intercept's smallest prime factor", sentence: () => "Tie-breaker: the bigger the y-intercept's smallest prime factor, the better.",
      rep: "si", sense: "max" },
    { id: "c-gpf", title: "the y-intercept's largest prime factor", sentence: () => "Tie-breaker: the bigger the y-intercept's largest prime factor, the better.",
      rep: "si", sense: "max" },
  ] as L<object>[],
};
export const primeGradient: RuleFamily<LineState, object> = {
  id: "prime-gradient", title: "Prime Gradient", card: (p, tb) => card(pg, p, tb),
  params: [], dealable: () => [{}], depends: ["si", "cart"], ...pg,
  evaluate(ctx) {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), cv = ctx.read(cRef);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) return allUndefined(ctx, pg, m === null ? mv : cv, m === null ? mRef : cRef);
    for (const p of nearbyPrimes(m)) {
      const g = ref("cart", "ghost", { g: p });
      ctx.read(g);
      ctx.term(`d${p}`, `distance to ${p}`, gap(m, q(p)), [mRef]);
      ctx.mark({ kind: "candidate", ref: g, term: `d${p}` });
    }
    const near = primeGap(m);
    const whole = c.d === 1n;
    ctx.term("near", "distance from the gradient to the nearest prime", near.d, [mRef]);
    ctx.term("prime", "that prime", q(near.p), [mRef]);
    ctx.term("cPrime", `distance from the y-intercept to ${primeGap(c).p}`, primeGap(c).d, [cRef]);
    ctx.term("c-spf", factorLabel("smallest", "the y-intercept", c), q(whole ? smallestPrimeFactor(c.n) : 1n), [cRef]);
    ctx.term("c-gpf", factorLabel("largest", "the y-intercept", c), q(whole ? largestPrimeFactor(c.n) : 1n), [cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "note", ref: mRef, text: `nearest prime ${near.p}` });
  },
};

// ---------------------------------------------------------------- 2. Triangle Area (owner)

type A = { A: number };
const ta = {
  main: { id: "area", title: "triangle area close to A", sentence: (p: A) => `The line and the two axes make a triangle; make its area as close as possible to ${p.A}.`,
    rep: "tri", sense: "min" } as L<A>,
  tieBreakers: [
    { id: "legs", title: "legs nearly whole", sentence: () => "Tie-breaker: the triangle's legs should be whole numbers, or fractions with bottom numbers as small as possible.",
      rep: "tri", sense: "min" },
    { id: "even", title: "legs nearly equal", sentence: () => "Tie-breaker: make the two legs as close to equal as possible.",
      rep: "tri", sense: "min" },
  ] as L<A>[],
};
export const triangleArea: RuleFamily<LineState, A> = {
  id: "triangle-area", title: "Triangle Area", card: (p, tb) => card(ta, p, tb),
  params: [{ name: "A", domain: "Z" }], dealable: () => [4, 6, 8, 12, 18].map(A => ({ A })), depends: ["tri", "cart", "si"], ...ta,
  evaluate(ctx, p) {
    const area = ref("tri", "area"), lx = ref("tri", "legX"), ly = ref("tri", "legY");
    const av = ctx.read(area);
    const a = num(av);
    if (a === null) return allUndefined(ctx, ta, av, area);
    const x = num(ctx.read(lx))!, y = num(ctx.read(ly))!;
    ctx.term("area", `distance from the area to ${p.A}`, gap(a, q(p.A)), [area]);
    ctx.term("legs", "the legs' bottom numbers − 2", q(x.d + y.d - 2n), [lx, ly]);
    ctx.term("even", "the difference between the legs", gap(x, y), [lx, ly]);
    ctx.mark({ kind: "focus", ref: lx });
    ctx.mark({ kind: "focus", ref: ly });
    ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, target ${p.A}` });
  },
};

// ---------------------------------------------------------------- 3. m Meets c (owner)

const mc = {
  main: { id: "gap", title: "gradient close to the y-intercept", sentence: () => "Make the gradient and the y-intercept as close as possible to each other.",
    rep: "si", sense: "min" } as L<object>,
  tieBreakers: [
    { id: "size", title: "they meet at a big number", sentence: () => "Tie-breaker: the bigger the y-intercept (ignoring its sign), the better.",
      rep: "si", sense: "max" },
    { id: "meetPrime", title: "they meet at a prime", sentence: () => "Tie-breaker: make the y-intercept as close as possible to a prime.",
      rep: "si", sense: "min" },
  ] as L<object>[],
};
export const mMeetsC: RuleFamily<LineState, object> = {
  id: "m-meets-c", title: "m Meets c", card: (p, tb) => card(mc, p, tb),
  params: [], dealable: () => [{}], depends: ["si", "cart"], ...mc,
  evaluate(ctx) {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), cv = ctx.read(cRef);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) return allUndefined(ctx, mc, m === null ? mv : cv, m === null ? mRef : cRef);
    ctx.term("gap", "distance between m and c", gap(m, c), [mRef, cRef]);
    ctx.term("size", "the size of c", Qn.abs(c), [cRef]);
    ctx.term("meetPrime", "distance from c to a prime", primeGap(c).d, [cRef]);
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

type KQ = { k: number; q: number };
const cc = {
  main: { id: "gap", title: "y(k) close to x(q)", sentence: (p: KQ) => `Make y(${p.k}) and x(${p.q}) as close as possible: y(${p.k}) is the height at x = ${p.k}, x(${p.q}) is where the line reaches height ${p.q}.`,
    rep: "mach", sense: "min" } as L<KQ>,
  tieBreakers: [
    { id: "size", title: "they cross at a big number", sentence: (p: KQ) => `Tie-breaker: the bigger x(${p.q}) is (ignoring its sign), the better.`,
      rep: "mach", sense: "max" },
    { id: "whole", title: "x(q) nearly whole", sentence: (p: KQ) => `Tie-breaker: x(${p.q}) should be a whole number, or a fraction with as small a bottom number as possible.`,
      rep: "mach", sense: "min" },
  ] as L<KQ>[],
};
export const crossingCheck: RuleFamily<LineState, KQ> = {
  id: "crossing-check", title: "Crossing Check", card: (p, tb) => card(cc, p, tb),
  params: [{ name: "k", domain: "Z" }, { name: "q", domain: "Z" }],
  dealable: () => [1, 2, 3].flatMap(k => [2, 4, 6].map(qq => ({ k, q: qq }))), depends: ["mach", "cart"], ...cc,
  evaluate(ctx, p) {
    const out = ref("mach", "out", { q: p.k }), rev = ref("mach", "reverse", { q: p.q });
    const ov = ctx.read(out), rv = ctx.read(rev);
    const y = num(ov), x = num(rv);
    if (y === null || x === null) return allUndefined(ctx, cc, y === null ? ov : rv, y === null ? out : rev);
    ctx.term("gap", `distance between y(${p.k}) and x(${p.q})`, gap(y, x), [out, rev]);
    ctx.term("size", `the size of x(${p.q})`, Qn.abs(x), [rev]);
    ctx.term("whole", `x(${p.q})'s bottom number − 1`, q(x.d - 1n), [rev]);
    const atX = ref("cart", "pointAtX", { q: p.k }), atY = ref("cart", "pointAtY", { q: p.q });
    ctx.read(atX); ctx.read(atY);
    ctx.mark({ kind: "focus", ref: out });
    ctx.mark({ kind: "focus", ref: rev });
    ctx.mark({ kind: "candidate", ref: atX });
    ctx.mark({ kind: "candidate", ref: atY });
  },
};

/** The owner's first examples: a second tier beside the beginner pool (beginner.ts). Whole Intercept is in rational.ts. */
export const ownerFamilies = [primeGradient, triangleArea, mMeetsC, crossingCheck] as const;
/** Every line family (the line type's list): the owner's, the beginner pool's, and the rational-native ones (undealt). */
export const families = [...ownerFamilies, ...beginnerFamilies, ...rationalFamilies, ...rational2Families] as const;
