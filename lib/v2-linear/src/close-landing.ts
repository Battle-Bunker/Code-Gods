/**
 * Close Landing: a prototype, not dealt (the coordinator's request after design-principles row 7, 15 Nov). The pool's
 * prime-ending families all reward a big reading (crossing, area, distance², intercept), and readings round, so a
 * number-class adversary on another reading dissolves: only size or direction opposes. This family rewards a small
 * one, on Prime Landing's own reading:
 *
 * Main part, unbounded: the x-axis crossing X = −c/m should round to a unit fraction 1/n (that is, 1/|X| rounds to n),
 * the bigger n the better, in triangular levels of n's digits (numbers.ts digitLevel), as Prime Landing's primes. A
 * crossing farther out (|X| ≥ 2, where 1/|X| rounds to 0) scores below every rung, graded by how far it is from 2; a
 * line through the origin (X = 0) scores nothing (its main part is undefined and ranks last), since 1/0 is no number;
 * a flat line never lands.
 *
 * Tie-breaker, read from that n (a new form, not "minus 1 shares a factor with the intercept"): the y-intercept's
 * nearest whole number r, when it divides n, the bigger the better (|r|), and 0 when it does not.
 *
 * Opposes on size: distance² from the origin is c²/(1 + m²) < X², so Ruler's big distance needs a far crossing; the
 * triangle's area is |c·X|/2 (Pythagorean Area, Square Area); Whole Crossing and Prime Landing want a big |X|; a big
 * intercept (Smooth Intercept, Prime Staircase, Divisibility Ladder) needs a gradient n times as big. Sits with Prime
 * Gradient (steep lines).
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { fromMC, type LineState } from "./line.ts";
import { allUndefined, family, ladder, more, num, type Shape } from "./layers.ts";
import { digitLevel, nearestInteger } from "./numbers.ts";

type None = Record<string, never>;
const shape: Shape<None> = {
  main: {
    ...more<None>("close", "the x-axis crossing close to the origin, at 1/n for as big an n as possible", "", "crossing"),
    sentence: () => "Where the line crosses the x-axis should round to 1/n (like 1/2, 1/10, 1/100) for as big an n as possible: as close to (0, 0) as you can, but never on it. Each extra digit of n counts for less.",
  },
  tieBreakers: [
    more<None>("divides", "the y-intercept divides n", "The y-intercept's nearest whole number should divide n, and the bigger it is the better.", "si"),
  ],
};

/** Lines whose crossing is exactly 1/n: y = n·x − 1, y = −n·x + 1 and y = n·x + 1 (crossing −1/n). */
export const closeWitness = (_p: None, n: number): LineState[] => {
  const N = q(BigInt(n));
  return [fromMC(N, q(-1)), fromMC(Qn.neg(N), q(1)), fromMC(N, q(1))].map(l => ({ lines: [l] }));
};

export const closeLanding = ladder(family<None>("close-landing", "Close Landing", ["crossing", "si"], shape, [{}], (ctx, _p) => {
  const xRef = ref("crossing", "x0"), cRef = ref("si", "c");
  const xv = ctx.read(xRef);
  const x = num(xv);
  if (x === null) return allUndefined(ctx, shape, xv, xRef);   // a flat line never lands (or lies along the axis)
  if (Qn.sign(x) === 0) {
    for (const l of [shape.main, ...shape.tieBreakers]) ctx.term(l.id, l.title, { undefined: "the line passes through (0, 0): 1/0 is no number" }, [xRef]);
    return;
  }
  const ax = Qn.abs(x), n = nearestInteger(Qn.inv(ax));
  const u: Q = n >= 1n ? digitLevel(n) : Qn.neg(Qn.sub(ax, q(2)));
  ctx.term("close", n >= 1n ? `lands at ${Qn.toWire(x)}, which rounds to ${Qn.sign(x) < 0 ? "−" : ""}1/${n}` : `lands at ${Qn.toWire(x)}, ${Qn.toWire(Qn.sub(ax, q(2)))} beyond 2`, u, [xRef]);
  const cv = ctx.read(cRef), c = num(cv);
  const r = c === null ? 0n : nearestInteger(Qn.abs(c));
  const d = n >= 1n && r > 0n && n % r === 0n ? r : 0n;
  ctx.term("divides", c === null ? "no y-intercept" : `the y-intercept rounds to ${r}${d ? `, which divides ${n}` : n >= 1n ? `, which does not divide ${n}` : ""}`, q(d), [xRef, cRef]);
  ctx.mark({ kind: "focus", ref: xRef });
}), closeWitness);
