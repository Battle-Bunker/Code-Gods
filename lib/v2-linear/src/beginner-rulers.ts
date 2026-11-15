/**
 * Treasure and Same on Both Rulers: the beginner families that read where the line passes a target (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { Qn, q, ref, type ElementRef, type Q } from "@workspace/v2-core";
import { allUndefined, distance, factorLabel, family, gap, more, num, prime, squareGap, verticalAt, verticalMain, type L, type Shape } from "./layers.ts";
import { distanceToPrime, distanceToWhole, isPrime, largestPrimeFactor, smallestPrimeFactor } from "./numbers.ts";

/** The smallest and largest prime factor of a whole number (|n|); 1 for 0, ±1 and fractions. */
const spfQ = (x: Q): Q => q(x.d === 1n ? smallestPrimeFactor(x.n) : 1n);
const gpfQ = (x: Q): Q => q(x.d === 1n ? largestPrimeFactor(x.n) : 1n);
/** Tie-breakers on the prime factors of a coefficient (the curator's §10.5: graded, an exact Euler-type sum). */
const factorTies = <P,>(of: "m" | "c", what: string): L<P>[] => [
  prime(more(`${of}-spf`, `${what}'s smallest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s smallest prime factor should be as big as possible.`, "si")),
  prime(more(`${of}-gpf`, `${what}'s largest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s largest prime factor should be as big as possible.`, "si")),
];

// ---------------------------------------------------------------- Treasure

type KT = { k: number; T: number };
/**
 * T = ±11 and ±13 are dealt, so parameter drift (the coordinator's trial call 18) has peers to redraw within reach:
 * at ±37 a starter needed longer than the 120 s interval to cross the 74 units between a target and its mirror and
 * parked midway (agents' pool-dynamics, #739). An exact main is worth 7.6–7.7 bits at ±11 and 7.9–8.0 at ±13, within
 * v1's 0.5 bits (±17 is 8.2–8.3, so it is not dealt). A target and its mirror are exact peers: the reflection y → −y keeps the law (its codes are even in a and c) and sends y(k) to −y(k), and
 * on the mirror every tie-breaker reads the reflected numbers (minus primes, a gradient near minus a prime, a y-intercept
 * near minus a square); lib/v2-linear test beginner.test.ts holds score(−T, reflected) = score(T, line).
 */
const TREASURES: KT[] = [11, 13].flatMap(T => [{ k: 2, T }, { k: 2, T: -T }]);
/** x, or −x on the mirror (T below zero). */
const flipT = (p: KT, x: Q): Q => (p.T < 0 ? Qn.neg(x) : x);
const treasureShape: Shape<KT> = {
  main: { ...distance<KT>("treasure", "y(k) close to T", "", "table"),
    sentence: p => `When x is ${p.k}, y should be as close as possible to ${p.T}.` },
  tieBreakers: [
    { ...more<KT>("prime-terms", "different primes among y(1) … y(8)", "", "table"),
      sentence: p => (p.T < 0 ? "As many as possible of y(1) … y(8) should be minus different primes." : "As many as possible of y(1) … y(8) should be different primes.") },
    { ...distance<KT>("prime-gradient", "the gradient close to a prime", "", "si"),
      sentence: p => `The gradient should be as close as possible to ${p.T < 0 ? "minus " : ""}a prime.` },
    { ...distance<KT>("square-start", "the y-intercept close to a square", "", "si"),
      sentence: p => `The y-intercept should be as close as possible to ${p.T < 0 ? "minus " : ""}a square number.` },
    ...factorTies<KT>("m", "the gradient"),
  ],
};
export const treasure = family<KT>("treasure", "Treasure", ["table", "si", "cart", "gen"], treasureShape, TREASURES, (ctx, p) => {
  // A vertical line x = k passes the height T somewhere: how far across from the treasure (k, T) it does.
  const vx = verticalAt(ctx);
  if (vx) return verticalMain(ctx, treasureShape, `a vertical line: how far across from (${p.k}, ${p.T}) it passes`, gap(vx.x, q(p.k)), vx.from);
  const at = ref("table", "y", { x: p.k });
  const v = ctx.read(at);
  const y = num(v);
  if (y === null) return allUndefined(ctx, treasureShape, v, at);
  const m = num(ctx.read(ref("si", "m")))!, c = num(ctx.read(ref("si", "c")))!;
  const primes = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = 1; x <= 8; x++) {
    const r = ref("table", "y", { x });
    const t = flipT(p, num(ctx.read(r))!);
    cols.push(r);
    if (t.d === 1n && isPrime(t.n) && !primes.has(t.n)) { primes.add(t.n); ctx.mark({ kind: "focus", ref: r }); }
  }
  ctx.term("treasure", `distance from y(${p.k}) to ${p.T}`, gap(y, q(p.T)), [at]);
  ctx.term("prime-terms", "different primes among y(1) … y(8)", q(primes.size), cols);
  ctx.term("prime-gradient", `distance from the gradient to ${p.T < 0 ? "minus " : ""}a prime`, distanceToPrime(flipT(p, m)), [ref("si", "m")]);
  ctx.term("square-start", `distance from the y-intercept to ${p.T < 0 ? "minus " : ""}a square`, squareGap(flipT(p, c)).d, [ref("si", "c")]);
  ctx.term("m-spf", factorLabel("smallest", "the gradient", m), spfQ(m), [ref("si", "m")]);
  ctx.term("m-gpf", factorLabel("largest", "the gradient", m), gpfQ(m), [ref("si", "m")]);
  ctx.mark({ kind: "focus", ref: at });
  // The target T on the y-axis, so the plane can draw where y(k) should land (marks only).
  const tm = ref("cart", "yAxisMark", { y: p.T });
  ctx.read(tm);
  ctx.mark({ kind: "candidate", ref: tm, term: "treasure" });
});

// ---------------------------------------------------------------- Same on Both Rulers

type T = { T: number };
/**
 * T and −T are dealt, so parameter drift (the coordinator's trial call 18) has a peer to redraw. They are exact peers:
 * the reflection through the origin, (m, c) → (m, −c), keeps the law (its codes are even in c), sends the unchanged
 * number to minus itself, and leaves every tie-breaker's reading as it was (|c|, the gradient, the lamp, how many
 * different whole values); lib/v2-linear test beginner.test.ts holds score(−T, reflected) = score(T, line).
 */
const RULERS_T: T[] = [{ T: 6 }, { T: -6 }];
const rulersShape: Shape<T> = {
  main: { ...distance<T>("fixed", "the unchanged number close to T", "", "mach"),
    sentence: p => `The number the machine leaves unchanged (where the line crosses y = x) should be as close as possible to ${p.T}.` },
  tieBreakers: [
    more("steep", "the gradient far from 1", "The gradient should be as far from 1 as possible.", "si"),
    distance("prime-start", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si"),
    more("whole-values", "different whole numbers among y(−5) … y(5)", "As many of y(−5) … y(5) as possible should be different whole numbers.", "table"),
    distance("whole-lamp", "the lamp's height close to whole", "The lamp's height m/(m − 1) should be as close as possible to a whole number.", "mach"),
    ...factorTies<T>("m", "the gradient"),
  ],
};
export const sameOnBothRulers = family<T>("same-on-both-rulers", "Same on Both Rulers", ["mach", "si", "table", "gen"], rulersShape, RULERS_T, (ctx, p) => {
  // A vertical line x = k meets y = x at (k, k): k is the number it leaves unchanged.
  const vx = verticalAt(ctx);
  if (vx) return verticalMain(ctx, rulersShape, `a vertical line meets y = x at ${Qn.toWire(vx.x)}: distance to ${p.T}`, gap(vx.x, q(p.T)), vx.from);
  const fRef = ref("mach", "fixed");
  const fv = ctx.read(fRef);
  const f = num(fv);
  if (f === null) return allUndefined(ctx, rulersShape, fv, fRef);
  const mRef = ref("si", "m");
  const m = num(ctx.read(mRef))!, c = num(ctx.read(ref("si", "c")))!;
  const lamp = ref("mach", "lamp");
  const lv = num(ctx.read(lamp))!;
  const wholes = new Set<bigint>();
  const cols: ElementRef[] = [];
  for (let x = -5; x <= 5; x++) {
    const r = ref("table", "y", { x });
    const t = num(ctx.read(r))!;
    cols.push(r);
    if (t.d === 1n) wholes.add(t.n);
  }
  ctx.term("fixed", `distance from the unchanged number to ${p.T}`, gap(f, q(p.T)), [fRef]);
  ctx.term("prime-start", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [ref("si", "c")]);
  ctx.term("whole-values", "different whole values among y(−5) … y(5)", q(wholes.size), cols);
  ctx.term("whole-lamp", "distance from the lamp's height to whole", distanceToWhole(lv), [lamp]);
  ctx.term("m-spf", factorLabel("smallest", "the gradient", m), spfQ(m), [mRef]);
  ctx.term("m-gpf", factorLabel("largest", "the gradient", m), gpfQ(m), [mRef]);
  ctx.term("steep", "|m − 1|", gap(m, Qn.ONE), [mRef]);
  ctx.mark({ kind: "focus", ref: fRef });
});

