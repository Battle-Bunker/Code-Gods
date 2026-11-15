/**
 * Size adversaries coupled through another number: prototypes, not dealt (the coordinator, 15 Nov, after Close
 * Landing, docs/engine-v2/close-landing-prototype.md). Close Landing wanted a small crossing on Prime Landing's own
 * reading and excluded it outright: opposite directions on one reading are zero-sum on every object. These two want
 * a small coefficient that the big readings depend on, so they oppose through the line rather than on one number:
 *
 * - Close Intercept: the y-intercept should round to 1/n (1/|c| rounds to n), the bigger n the better. Against Smooth
 *   Intercept, Prime Staircase and Divisibility Ladder (a big intercept), and the crossing, area and distance only
 *   through the gradient (X = −c/m: a small c with a far crossing needs a shallow line).
 * - Close Gradient: the gradient should round to 1/n, the bigger n the better. Against Prime Gradient (a steep line), and
 *   the crossing (−c/m) and area (c²/2|m|) in the other direction: a shallow line crosses far.
 *
 * Main part, unbounded: n in triangular levels of its digits (numbers.ts digitLevel), as Prime Landing's primes; a
 * coefficient of 2 or more scores below every rung, graded by its distance from 2; 0 scores nothing (1/0 is no number).
 * Tie-breaker, read from n (a new form): the other coefficient's nearest whole number should be a multiple of n, the
 * bigger the multiple the better (0 when it is not one).
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { fromMC, type LineState } from "./line.ts";
import { allUndefined, family, ladder, more, num, type Shape } from "./layers.ts";
import { digitLevel, nearestInteger } from "./numbers.ts";

type None = Record<string, never>;

function closeFamily(id: string, title: string, own: "m" | "c", other: "m" | "c", what: string, otherWhat: string, witness: (n: bigint) => [Q, Q][]) {
  const shape: Shape<None> = {
    main: {
      ...more<None>("close", `${what} close to 0, at 1/n for as big an n as possible`, "", "si"),
      sentence: () => `${what[0]!.toUpperCase()}${what.slice(1)} should round to 1/n (like 1/2, 1/10, 1/100) for as big an n as possible: as close to 0 as you can, but never 0. Each extra digit of n counts for less.`,
    },
    tieBreakers: [
      more<None>("multiple", `${otherWhat} a multiple of n`, `${otherWhat[0]!.toUpperCase()}${otherWhat.slice(1)}'s nearest whole number should be a multiple of n, and the bigger the multiple the better.`, "si"),
    ],
  };
  const f = family<None>(id, title, ["si"], shape, [{}], (ctx, _p) => {
    const oRef = ref("si", own), tRef = ref("si", other);
    const ov = ctx.read(oRef), x = num(ov);
    if (x === null) return allUndefined(ctx, shape, ov, oRef);   // a vertical line has no gradient or intercept
    if (Qn.sign(x) === 0) {
      for (const l of [shape.main, ...shape.tieBreakers]) ctx.term(l.id, l.title, { undefined: `${what} is 0: 1/0 is no number` }, [oRef]);
      return;
    }
    const ax = Qn.abs(x), n = nearestInteger(Qn.inv(ax));
    const u: Q = n >= 1n ? digitLevel(n) : Qn.neg(Qn.sub(ax, q(2)));
    ctx.term("close", n >= 1n ? `${what} ${Qn.toWire(x)} rounds to ${Qn.sign(x) < 0 ? "−" : ""}1/${n}` : `${what} ${Qn.toWire(x)} is ${Qn.toWire(Qn.sub(ax, q(2)))} beyond 2`, u, [oRef]);
    const tv = ctx.read(tRef), t = num(tv);
    const w = t === null ? 0n : nearestInteger(Qn.abs(t));
    const k = n >= 1n && w > 0n && w % n === 0n ? w / n : 0n;
    ctx.term("multiple", t === null ? `no ${otherWhat}` : `${otherWhat} rounds to ${w}${k ? ` = ${k} × ${n}` : n >= 1n ? `, not a multiple of ${n}` : ""}`, q(k), [oRef, tRef]);
    ctx.mark({ kind: "focus", ref: oRef });
  });
  // The cheapest lines on the k-th digit of the ladder (value.ts ladderCaps): 1/n for n = 10^(k−1), the smallest n with k digits.
  return ladder(f, (_p: None, k: number) => witness(10n ** BigInt(k - 1)).map(([m, c]) => ({ lines: [fromMC(m, c)] }) as LineState));
}

export const closeIntercept = closeFamily("close-intercept", "Close Intercept", "c", "m", "the y-intercept", "the gradient",
  n => [[q(0), q(1n, n)], [q(1), q(1n, n)], [q(-1), q(-1n, n)]]);
export const closeGradient = closeFamily("close-gradient", "Close Gradient", "m", "c", "the gradient", "the y-intercept",
  n => [[q(1n, n), q(0)], [q(1n, n), q(1)], [q(-1n, n), q(-1)]]);
