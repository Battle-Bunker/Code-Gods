/**
 * Treasure and Same on Both Rulers: the beginner families that read where the line passes a target (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { gcd, Qn, q, ref, type ElementRef, type Q } from "@workspace/v2-core";
import { allUndefined, distance, factorLabel, family, gap, more, num, prime, verticalAt, verticalMain, ladder, type L, type Shape } from "./layers.ts";
import { digitLevel, distanceToPrime, distanceToWhole, isqrt, largestPrimeFactor, nearestInteger, smallestPrimeFactor } from "./numbers.ts";

/** The smallest and largest prime factor of a whole number (|n|); 1 for 0, ±1 and fractions. */
const spfQ = (x: Q): Q => q(x.d === 1n ? smallestPrimeFactor(x.n) : 1n);
const gpfQ = (x: Q): Q => q(x.d === 1n ? largestPrimeFactor(x.n) : 1n);
/** Tie-breakers on the prime factors of a coefficient (the curator's §10.5: graded, an exact Euler-type sum). */
const factorTies = <P,>(of: "m" | "c", what: string): L<P>[] => [
  prime(more(`${of}-spf`, `${what}'s smallest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s smallest prime factor should be as big as possible.`, "si")),
  prime(more(`${of}-gpf`, `${what}'s largest prime factor`, `${what[0]!.toUpperCase()}${what.slice(1)}'s largest prime factor should be as big as possible.`, "si")),
];

// ---------------------------------------------------------------- Treasure

/**
 * Treasure as a ladder (design-principles.md; redesigned 15 Nov by the lens worker, declared to the coordinator as a
 * trial). Main part, unbounded: when x is k, y should round to a coin pile, a triangular number 1, 3, 6, 10, 15, … (a pile
 * n coins high holds n(n + 1)/2), the bigger the better, in triangular levels of digits that each need more than the last
 * (u = digitLevel(pile), numbers.ts); any other y(k) scores below every pile, −(its distance to the nearest − ½). The
 * next pile is a shift of y(k) by about √(2·pile): a small move, growing slowly, so each level is dearer than the last.
 * Tie-breaker, read from the pile: the biggest number dividing both its height n and the whole part of the
 * gradient's size (|m|); a new pile changes n, so the climb starts again. Dealt: k = 3 and 4 (their levels within 0.02
 * bits; k = 2 is 0.5 bits above k = 3), each with its mirror (minus a
 * pile: the reflection y → −y keeps the law, so mirrors are exact peers). The old main part (y(k) close to T) had a top.
 */
type KT = { k: number; side?: 1 | -1 };
const TREASURES: KT[] = [3, 4].flatMap(k => [{ k }, { k, side: -1 as const }]);
/** x, or −x on the mirror. */
const flipT = (p: KT, x: Q): Q => (p.side === -1 ? Qn.neg(x) : x);
/** The height n of a coin pile t = n(n + 1)/2, or null when t is not one (t ≥ 1). */
export function pileHeight(t: bigint): bigint | null {
  if (t < 1n) return null;
  const r = isqrt(8n * t + 1n);
  return r * r === 8n * t + 1n ? (r - 1n) / 2n : null;
}
/** The coin pile nearest x (the smaller on a tie, as the agents' near() takes it), and its height. */
export function nearestPile(x: Q): { t: bigint; n: bigint } {
  const w = x.n <= 0n ? 0n : Qn.floor(x);
  const n0 = w < 1n ? 1n : (isqrt(8n * w + 1n) - 1n) / 2n, cands = [n0, n0 + 1n].filter(n => n >= 1n);
  const at = (n: bigint) => (n * (n + 1n)) / 2n;
  return cands.map(n => ({ t: at(n), n })).reduce((a, b) => (Qn.cmp(Qn.abs(Qn.sub(x, q(b.t))), Qn.abs(Qn.sub(x, q(a.t)))) < 0 ? b : a));
}
/** Treasure's rung: the pile y rounds to (u = digitLevel), else minus how far y is from rounding to the nearest pile. */
const pileRung = (y: Q): { t: bigint; n: bigint; u: Q } => {
  const w = nearestInteger(y), h = pileHeight(w);
  if (h !== null) return { t: w, n: h, u: digitLevel(w) };
  const { t, n } = nearestPile(y);
  return { t, n, u: Qn.neg(Qn.sub(Qn.abs(Qn.sub(y, q(t))), q(1, 2))) };
};
const piles = (p: KT) => `${p.side === -1 ? "minus " : ""}a coin pile (1, 3, 6, 10, 15, …)`;
const treasureShape: Shape<KT> = {
  main: { ...more<KT>("pile", "y(k) on as big a coin pile as possible", "", "table"),
    sentence: p => `When x is ${p.k}, y should land on ${piles(p)}, the bigger the better; otherwise, the closer to a pile the better.` },
  tieBreakers: [
    more<KT>("shared-factor", "the biggest number dividing both the pile's height and the gradient's whole part",
      "Tie-breaker: the pile is n coins high. The biggest number dividing both n and the gradient's whole part (ignoring sign) should be as big as possible.", "si"),
  ],
};
export const treasure = ladder(family<KT>("treasure", "Treasure", ["table", "si", "cart"], treasureShape, TREASURES, (ctx, p) => {
  const at = ref("table", "y", { x: p.k }), mRef = ref("si", "m");
  const v = ctx.read(at), y = num(v);
  if (y === null) return allUndefined(ctx, treasureShape, v, at);   // a vertical line has no y(k)
  const { t, n, u } = pileRung(flipT(p, y));
  // The whole part of |m| (not ⌊m⌋), so the mirror y → −y, which turns m to −m, reads the same number.
  const m = num(ctx.read(mRef))!, aw = Qn.floor(Qn.abs(m)), w = aw;
  ctx.term("pile", Qn.sign(u) > 0 ? `y(${p.k}) = ${Qn.toWire(y)} rounds to ${p.side === -1 ? "minus " : ""}the pile of ${t} (${n} coins high)` : `y(${p.k}) is ${Qn.toWire(Qn.abs(Qn.sub(flipT(p, y), q(t))))} from ${p.side === -1 ? "minus " : ""}the pile of ${t}`, u, [at]);
  ctx.term("shared-factor", `${n} and the gradient's whole part ${w}: the biggest number dividing both is ${aw === 0n ? 0n : gcd(n, aw)}`, q(aw === 0n ? 0n : gcd(n, aw)), [at, mRef]);
  ctx.mark({ kind: "focus", ref: at });
  const tm = ref("cart", "yAxisMark", { y: flipT(p, q(t)) });
  ctx.read(tm);
  ctx.mark({ kind: "candidate", ref: tm, term: "pile" });
}));

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

