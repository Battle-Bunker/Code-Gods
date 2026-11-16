/**
 * Rule families (spec §12.5). Each has a main layer in school-textbook terms (gradient, intercepts, substitution, table
 * of values) and a list of alternative tie-breakers (owner decisions 12–14): a dealt rule is the main layer plus one
 * of them. Every layer is a distance, a count or a size, never a yes/no test (decision 13).
 */
import { cardText, gcd, Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { digitLevel, digitNote, isPrimeEnding, largestPrimeFactor, nearbyPrimes, nearestPrimeEnding, smallestPrimeFactor } from "./numbers.ts";
import { beginnerFamilies, factorLabel } from "./beginner.ts";
import { closeLanding } from "./close-landing.ts";
import { closeGradient, closeIntercept } from "./close-readings.ts";
import { gradientWitness } from "./witnesses.ts";
import { rationalFamilies } from "./rational.ts";
import { rational2Families } from "./rational2.ts";
import { twinFractions } from "./frac-twin-fractions.ts";
import { tupleFamilies } from "./tuple-rules.ts";
import { treeNtFamilies } from "./tree-nt-index.ts";

type Ctx = EvalContext<LineState>;
type L<P> = Layer<P>;

const undef = (v: ElementValue): Undef => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));
const primeGap = (x: Q): { p: bigint; d: Q } => { const p = nearbyPrimes(x)[0]!; return { p, d: gap(x, q(p)) }; };
const primeGapEnding = (x: Q, k: number): { p: bigint; d: Q } => { const p = nearestPrimeEnding(x, k); return { p, d: gap(x, q(p)) }; };
/** Prime Gradient's dealt filter (owner decision 41): the primes it counts end in this digit. */
type Ends = { ends: number; side?: 1 | -1 };

/** Record the main layer and every tie-breaker as undefined (the main layer's input does not exist) and say why. */
function allUndefined<P>(ctx: Ctx, f: { main: L<P>; tieBreakers: readonly L<P>[] }, why: ElementValue, from: ElementRef): void {
  for (const l of [f.main, ...f.tieBreakers]) ctx.term(l.id, l.title, undef(why), [from]);
  ctx.mark({ kind: "note", ref: from, text: undef(why).undefined });
}
/** The card: the main goal's sentence, then each secondary preference's in order (v2-core cardText). */
function card<P>(f: { main: L<P>; tieBreakers: readonly L<P>[] }, p: P, tb: TieBreaker): string {
  return cardText(f.main, f.tieBreakers, p, tb);
}

// ---------------------------------------------------------------- 1. Prime Gradient (owner)

/**
 * Prime Gradient as a ladder (design-principles.md; redesigned 15 Nov, declared to the coordinator), on the gradient as
 * Prime Landing is on the x-axis crossing. Main part, unbounded: the gradient should round to a prime p ending in k (or
 * minus one, on the mirror), the bigger the better, in levels of digits that each need more than the last (u =
 * digitLevel(p), numbers.ts); any other gradient scores below every rung, −(its distance to the nearest − ½). Tie-breaker,
 * read from p: the biggest number dividing both p + 1 and the y-intercept's whole part (ignoring signs); a new rung
 * changes p + 1, so the climb starts again. The old tie-breakers leave: the size of that prime (now the main part
 * itself), the y-intercept near such a prime (an independent wish, decision 29), and its smallest and largest prime
 * factors (hills a shift climbs at every size: the pool's 40-bit seats). Dealt: endings 1 and 9, each with its mirror
 * (the reflection y → −y keeps the law and |c|). A tilt moves the gradient and Prime Landing's crossing together, so
 * the two contest one move; a shift serves Prime Landing alone.
 */
const pg = {
  main: { id: "gradient", title: "the gradient rounding to as big a dealt prime as possible", rep: "si", sense: "max",
    sentence: (p: Ends) => `The gradient should round to ${p.side === -1 ? "minus " : ""}a prime ending in ${p.ends}. Bigger primes are better, though each extra digit counts for less.` } as L<Ends>,
  tieBreakers: [
    { id: "shared-factor", title: "the biggest number dividing both that prime plus 1 and the y-intercept's whole part", rep: "si", sense: "max",
      sentence: () => "That prime plus 1 and the y-intercept's whole part should share as big a factor as possible." },
  ] as L<Ends>[],
};
export const primeGradient: RuleFamily<LineState, Ends> = {
  id: "prime-gradient", title: "Prime Gradient", card: (p, tb) => card(pg, p, tb), keepsParams: true, witness: gradientWitness,
  params: [], dealable: () => [1, 9].flatMap(ends => [{ ends }, { ends, side: -1 as const }]), depends: ["si", "cart"], ...pg,
  evaluate(ctx, pr) {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), cv = ctx.read(cRef);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) return allUndefined(ctx, pg, m === null ? mv : cv, m === null ? mRef : cRef);
    // On the mirror (side −1) the gradient is read reflected: rounding to minus a prime.
    const s = pr.side === -1 ? -1n : 1n, x = s === 1n ? m : Qn.neg(m);
    const n = Qn.floor(Qn.add(x, q(1, 2)));
    const on = n > 0n && isPrimeEnding(n, pr.ends);
    const p = on ? n : nearestPrimeEnding(x, pr.ends);
    const g = ref("cart", "ghost", { g: s * p });
    ctx.read(g);
    ctx.term("gradient", on ? `the gradient ${Qn.toWire(m)} rounds to ${s === 1n ? "" : "minus "}the prime ${p}: ${digitNote(p)}` : `${Qn.toWire(Qn.abs(Qn.sub(x, q(p))))} from ${s === 1n ? "" : "minus "}the prime ${p}`,
      on ? digitLevel(p) : Qn.neg(Qn.sub(gap(x, q(p)), q(1, 2))), [mRef]);
    const w = Qn.floor(Qn.abs(c));
    ctx.term("shared-factor", `${p + 1n} and the y-intercept's whole part ${w}: the biggest number dividing both is ${w === 0n ? 0n : gcd(p + 1n, w)}`, q(w === 0n ? 0n : gcd(p + 1n, w)), [mRef, cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "candidate", ref: g, term: "gradient" });
  },
};

// ---------------------------------------------------------------- 2. Triangle Area (owner)

type A = { A: number };
const ta = {
  main: { id: "area", title: "triangle area close to A", sentence: (p: A) => `The line and the two axes make a triangle; make its area as close as possible to ${p.A}.`,
    rep: "tri", sense: "min" } as L<A>,
  tieBreakers: [
    { id: "legs", title: "legs nearly whole", sentence: () => "The triangle's legs should be whole numbers, or fractions with bottom numbers as small as possible.",
      rep: "tri", sense: "min" },
    { id: "even", title: "legs nearly equal", sentence: () => "Make the two legs as close to equal as possible.",
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
    { id: "size", title: "they meet at a big number", sentence: () => "The bigger the y-intercept (ignoring its sign), the better.",
      rep: "si", sense: "max" },
    { id: "meetPrime", title: "they meet at a prime", sentence: () => "Make the y-intercept as close as possible to a prime.",
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
    { id: "size", title: "they cross at a big number", sentence: (p: KQ) => `The bigger x(${p.q}) is (ignoring its sign), the better.`,
      rep: "mach", sense: "max" },
    { id: "whole", title: "x(q) nearly whole", sentence: (p: KQ) => `X(${p.q}) should be a whole number, or a fraction with as small a bottom number as possible.`,
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
/** Close Landing, Close Intercept and Close Gradient (close-landing.ts, close-readings.ts) are prototypes: valued and measured, in no pool.
 * The fraction-native families (frac-*.ts, docs/engine-v2/fraction-families.md) and the tuple families (tuple-rules.ts,
 * pool-plan.md v2) are undealt until the owner has read their cards. */
export const families = [...ownerFamilies, ...beginnerFamilies, ...rationalFamilies, ...rational2Families, closeLanding, closeIntercept, closeGradient, twinFractions, ...tupleFamilies, ...treeNtFamilies] as const;
