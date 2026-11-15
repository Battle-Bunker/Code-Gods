/**
 * Treasure and Same on Both Rulers: the beginner families that read where the line passes a target (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { gcd, Qn, q, ref, type Q } from "@workspace/v2-core";
import { fromMC, type LineState } from "./line.ts";
import { allUndefined, family, more, num, verticalAt, verticalMain, ladder, type Shape } from "./layers.ts";
import { digitLevel, isqrt, nearestInteger } from "./numbers.ts";

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
/**
 * Treasure's witnesses for the tail cap (lib/v2-linear witnesses.ts): the n-th unit is a pile of n digits; the smallest,
 * reached by the flat line y = T and the lines of gradient ±1 through (k, T) (minus T on the mirror).
 */
export const treasureWitness = (p: KT, n: number): LineState[] => {
  const lo = 10n ** BigInt(n - 1);
  let h = (isqrt(8n * lo + 1n) - 1n) / 2n;
  while ((h * (h + 1n)) / 2n < lo) h++;
  const T = q(((h * (h + 1n)) / 2n) * (p.side === -1 ? -1n : 1n)), k = q(p.k);
  return [Qn.ZERO, Qn.ONE, Qn.neg(Qn.ONE)].map(m => ({ lines: [fromMC(m, Qn.sub(T, Qn.mul(m, k)))] }));
};
const piles = (p: KT) => `${p.side === -1 ? "minus " : ""}a coin pile (1, 3, 6, 10, 15, …)`;
const treasureShape: Shape<KT> = {
  main: { ...more<KT>("pile", "y(k) on as big a coin pile as possible", "", "table"),
    sentence: p => `When x is ${p.k}, y should land on ${piles(p)}, the bigger the better; otherwise, the closer to a pile the better.` },
  tieBreakers: [
    more<KT>("shared-factor", "the biggest number dividing both the pile's height and the gradient's whole part",
      "The pile is n coins high: n and the gradient's whole part should share the biggest factor possible.", "si"),
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
}), treasureWitness);

// ---------------------------------------------------------------- Same on Both Rulers

/**
 * Same on Both Rulers as a ladder (design-principles.md; redesigned 15 Nov by the lens worker, declared to the
 * coordinator as a trial). Main part, unbounded: the number the machine leaves unchanged, f = c/(1 − m) (where the line
 * crosses y = x), should round to a palindrome starting and ending in d (d, dd, d0d, d1d, …, d00d, …), the bigger the
 * better, in triangular levels of digits that each need more than the last (u = digitLevel); any other f scores below
 * every palindrome, −(its distance to the nearest − ½). Palindromes of n digits are about 10^⌊n/2⌋ apart, so the next
 * rung is a small move of f that grows with the level; f moves by Δc/(1 − m), so a gradient near 1 (a far fixed point)
 * is the lever and its own price. Tie-breaker, read from the palindrome: the biggest number dividing both its digit sum
 * and the whole part of |c|; a new palindrome changes the digit sum, so the climb starts again. Dealt: d = 1 and 2, each
 * with its mirror (minus a palindrome: the reflection through the origin, (m, c) → (m, −c), sends f to −f and keeps |c|
 * and the law, so mirrors are exact peers). The old main part (f close to T = ±6) had a top.
 */
type PD = { d: number; side?: 1 | -1 };
const RULERS: PD[] = [1, 2].flatMap(d => [{ d }, { d, side: -1 as const }]);
const flipR = (p: PD, x: Q): Q => (p.side === -1 ? Qn.neg(x) : x);
/** The n-digit palindrome whose first ⌈n/2⌉ digits are h. */
const mirrorHalf = (h: bigint, n: number): bigint => { const s = h.toString(); return BigInt(s + [...s.slice(0, n >> 1)].reverse().join("")); };
/** The palindrome starting (and ending) in the digit d nearest x (the smaller on a tie, as the starters take it). */
export function nearestPalindrome(x: Q, d: number): bigint {
  const w = x.n <= 0n ? 0n : Qn.floor(x), L = w.toString().length, cands: bigint[] = [];
  for (let n = Math.max(1, L - 1); n <= L + 1; n++) {
    const k = (n + 1) >> 1, lo = BigInt(d) * 10n ** BigInt(k - 1), hi = lo + 10n ** BigInt(k - 1) - 1n;
    const h0 = n === L ? BigInt(w.toString().slice(0, k)) : lo;
    for (const h of [lo, hi, h0 - 1n, h0, h0 + 1n]) if (h >= lo && h <= hi) cands.push(mirrorHalf(h, n));
  }
  const far = (t: bigint) => Qn.abs(Qn.sub(x, q(t)));
  return cands.reduce((a, b) => { const c = Qn.cmp(far(b), far(a)); return c < 0 || (c === 0 && b < a) ? b : a; });
}
/** The digits of a whole number added up. */
export const digitSum = (t: bigint): bigint => [...(t < 0n ? -t : t).toString()].reduce((a, ch) => a + BigInt(ch), 0n);
/** The rung f stands on: the palindrome it rounds to (u = digitLevel), else minus how far f is from rounding to the nearest. */
const palindromeRung = (f: Q, d: number): { t: bigint; u: Q } => {
  const t = nearestPalindrome(f, d);
  return { t, u: nearestInteger(f) === t ? digitLevel(t) : Qn.neg(Qn.sub(Qn.abs(Qn.sub(f, q(t))), q(1, 2))) };
};
/** The witnesses for the tail cap: the smallest n-digit palindrome in d (d, then d0…0d), on the lines y = P, y = 2P − x, y = 2x − P. */
export const rulersWitness = (p: PD, n: number): LineState[] => {
  const P = n === 1 ? BigInt(p.d) : BigInt(p.d) * 10n ** BigInt(n - 1) + BigInt(p.d), s = p.side === -1 ? -1n : 1n;
  return ([[0, s * P], [-1, 2n * s * P], [2, -s * P]] as const).map(([m, c]) => ({ lines: [fromMC(q(m), q(c))] }));
};
const palindromes = (p: PD) => `${p.side === -1 ? "minus " : ""}a number reading the same backwards, starting and ending in ${p.d} (${p.d}, ${p.d}${p.d}, ${p.d}1${p.d})`;
const rulersShape: Shape<PD> = {
  main: { ...more<PD>("palindrome", "the unchanged number on as big a palindrome as possible", "", "mach"),
    sentence: p => `The line should cross y = x at ${palindromes(p)}: bigger is better; otherwise closer is better.` },
  tieBreakers: [
    more<PD>("shared-factor", "the biggest number dividing both the palindrome's digit sum and the y-intercept's whole part",
      "That number's digits added up and the y-intercept's whole part should share the biggest factor possible.", "si"),
  ],
};
export const sameOnBothRulers = ladder(family<PD>("same-on-both-rulers", "Same on Both Rulers", ["mach", "si", "gen"], rulersShape, RULERS, (ctx, p) => {
  // A vertical line x = k meets y = x at (k, k): k is the number it leaves unchanged.
  const vx = verticalAt(ctx);
  if (vx) {
    const { t, u } = palindromeRung(flipR(p, vx.x), p.d);
    return verticalMain(ctx, rulersShape, `a vertical line meets y = x at ${Qn.toWire(vx.x)}: ${Qn.sign(u) > 0 ? "on" : "near"} ${p.side === -1 ? "minus " : ""}${t}`, u, vx.from);
  }
  const fRef = ref("mach", "fixed");
  const fv = ctx.read(fRef);
  const f = num(fv);
  if (f === null) return allUndefined(ctx, rulersShape, fv, fRef);   // parallel to y = x: no number stays unchanged
  const cRef = ref("si", "c");
  const c = num(ctx.read(cRef))!, wc = Qn.floor(Qn.abs(c));
  const { t, u } = palindromeRung(flipR(p, f), p.d), sum = digitSum(t), g = wc === 0n ? 0n : gcd(sum, wc);
  const minus = p.side === -1 ? "minus " : "";
  ctx.term("palindrome", Qn.sign(u) > 0 ? `the unchanged number ${Qn.toWire(f)} rounds to ${minus}the palindrome ${t}` : `the unchanged number ${Qn.toWire(f)} is ${Qn.toWire(Qn.abs(Qn.sub(flipR(p, f), q(t))))} from ${minus}the palindrome ${t}`, u, [fRef]);
  ctx.term("shared-factor", `${t}'s digits add up to ${sum}; the y-intercept's whole part is ${wc}: the biggest number dividing both is ${g}`, q(g), [fRef, cRef]);
  ctx.mark({ kind: "focus", ref: fRef });
}), rulersWitness);
