/**
 * Plus Its Flip: a fraction-native line family in the owner's tree shape (design-principles.md principle 3b; the owner,
 * 16 Nov: "add 4 rules / utility functions that prefer non-integer rational values"). In no pool until the coordinator
 * has read its walk-through (docs/engine-v2/fraction-families-b.md).
 *
 * Reading: where the line crosses the x-axis, ignoring its sign (−c/a: both numbers of the line, −(y-intercept) ÷
 * gradient). Targets: a whole number n plus k over n, n + k/n (k dealt: 1, −1, 2 or −2), leaving out the whole ones:
 * 5/2, 10/3, 17/4, 26/5, … for k = 1. They are fractions by construction, and there is no stretch that carries one
 * target onto the next (unlike powers), so the ladder is climbed one step at a time.
 * Primary (no top): n of the target nearest the reading, higher better (halfway, the smaller).
 * Secondary: how far the reading is from that target, counted in n-ths (|reading − target| × n), smaller better. In
 * plain units every whole crossing near a big n is within 1/n of its target, so the good states were whole crossings
 * (measured: a = ±1 lines, 0.6 of the top decile fractional). Counted in n-ths, a whole crossing is always a full step
 * away (|k| n-ths), and only a crossing whose bottom number is n can be on the target.
 * Thirds (repertoire, row 3a; each reads n, so a step up the ladder restarts it):
 *   y-near-n:      the y-intercept (ignoring its sign) near n;
 *   gradient-flip: the gradient (ignoring its sign) near 1/n, the flip of n;
 *   at-n:          y when x = n, near a whole number.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export type FlipParams = { k: 1 | -1 | 2 | -2 };

const target = (n: bigint, k: number): Q => Qn.add(q(n), q(BigInt(k), n));
/** The target n + k/n nearest x ≥ 0, leaving out whole targets and those at or below 0; halfway, the smaller n. */
export function flipTarget(x: Q, k: number): { n: bigint; t: Q } {
  const fl = Qn.floor(x);
  let best: { n: bigint; t: Q; d: Q } | null = null;
  for (let n = fl - 3n < 1n ? 1n : fl - 3n; n <= fl + 4n; n++) {
    const t = target(n, k);
    if (Qn.isInteger(t) || Qn.sign(t) <= 0) continue;
    const d = Qn.abs(Qn.sub(x, t));
    if (!best || Qn.cmp(d, best.d) < 0) best = { n, t, d };
  }
  return { n: best!.n, t: best!.t };
}

const examples: Record<FlipParams["k"], string> = {
  1: "n + 1/n: 2 + 1/2 = 5/2, 3 + 1/3 = 10/3, 4 + 1/4 = 17/4, …",
  [-1]: "n − 1/n: 2 − 1/2 = 3/2, 3 − 1/3 = 8/3, 4 − 1/4 = 15/4, …",
  2: "n + 2/n: 3 + 2/3 = 11/3, 4 + 2/4 = 9/2, 5 + 2/5 = 27/5, … (2 + 2/2 = 3 is whole, so it is left out)",
  [-2]: "n − 2/n: 3 − 2/3 = 7/3, 4 − 2/4 = 7/2, 5 − 2/5 = 23/5, … (2 − 2/2 = 1 is whole, so it is left out)",
};
const shape: Shape<FlipParams> = {
  main: {
    ...more<FlipParams>("level", "n of the nearest whole-number-plus-its-flip to the crossing", "", "crossing"),
    sentence: p => `Look at where the line crosses the x-axis, ignoring a minus sign. The targets are a whole number n ${p.k > 0 ? "plus" : "minus"} ${Math.abs(p.k)} over n: ${examples[p.k]}; never a whole number. Find the target nearest the crossing (halfway between two, the smaller). Primary: its n: bigger is better.`,
  },
  tieBreakers: [
    distance<FlipParams>("close", "how far the crossing is from that target, in n-ths", "how far the crossing is from that target, counted in steps of 1/n (for n = 4, in quarters: 17/4 is 0 quarters away, 4 is 1 quarter away): fewer is better.", "crossing"),
    distance<FlipParams>("y-near-n", "the y-intercept near n", "the y-intercept (ignoring a minus sign) as close as possible to the same n.", "si"),
    distance<FlipParams>("gradient-flip", "the gradient near 1/n", "the gradient (ignoring a minus sign) as close as possible to 1/n, the flip of n (for n = 4: 1/4).", "si"),
    distance<FlipParams>("at-n", "y when x is n, near a whole number", "y when x is n, as close as possible to a whole number.", "si"),
  ],
};

export const plusFlip = family<FlipParams>("plus-flip", "Plus Its Flip", ["crossing", "si"], shape,
  onRationals(([1, -1, 2, -2] as const).map(k => ({ k }))), (ctx, p) => {
    const xRef = ref("crossing", "x0"), mRef = ref("si", "m"), cRef = ref("si", "c");
    const xv = ctx.read(xRef), mv = ctx.read(mRef), cv = ctx.read(cRef);
    const x = num(xv);
    if (x === null) return allUndefined(ctx, shape, xv, xRef);
    const size = Qn.abs(x), { n, t } = flipTarget(size, p.k), d = Qn.abs(Qn.sub(size, t));
    ctx.term("level", `the crossing ${Qn.toWire(x)}: the nearest target is ${n} ${p.k > 0 ? "+" : "−"} ${Math.abs(p.k)}/${n} = ${Qn.toWire(t)}`, q(n), [xRef]);
    ctx.term("close", `${Qn.toWire(size)} is ${Qn.toWire(d)} from ${Qn.toWire(t)}: ${Qn.toWire(Qn.mul(d, q(n)))} steps of 1/${n}`, Qn.mul(d, q(n)), [xRef]);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) {
      for (const id of ["y-near-n", "gradient-flip", "at-n"]) ctx.term(id, "a vertical line has no gradient or y-intercept", { undefined: "a vertical line has no gradient or y-intercept" }, [mRef]);
    } else {
      ctx.term("y-near-n", `the y-intercept ${Qn.toWire(c)} against ${n}`, Qn.abs(Qn.sub(Qn.abs(c), q(n))), [xRef, cRef]);
      ctx.term("gradient-flip", `the gradient ${Qn.toWire(m)} against 1/${n}`, Qn.abs(Qn.sub(Qn.abs(m), q(1n, n))), [xRef, mRef]);
      const y = Qn.add(Qn.mul(m, q(n)), c), w = Qn.floor(Qn.add(y, q(1, 2)));
      ctx.term("at-n", `y at x = ${n} is ${Qn.toWire(y)}, ${Qn.toWire(Qn.abs(Qn.sub(y, q(w))))} from ${w}`, Qn.abs(Qn.sub(y, q(w))), [xRef, mRef, cRef]);
    }
    ctx.mark({ kind: "focus", ref: xRef, term: "level" });
    ctx.mark({ kind: "note", ref: xRef, term: "close", text: `target ${Qn.toWire(t)} (n = ${n}), ${Qn.toWire(d)} away` });
  });
