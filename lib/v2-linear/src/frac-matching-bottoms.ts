/**
 * Matching Bottoms: an equivalent-fractions line family in the owner's tree shape (design-principles.md principle 3b;
 * owner decision 46; the coordinator's "two readings of the line that should be the same fraction in different forms").
 * In no pool until the coordinator has read its walk-through.
 *
 * Write the gradient and the y-intercept as fractions in lowest terms (both numbers of the line).
 * Primary (no top): the y-intercept's bottom number B, bigger better. A whole-number line has B = 1, the foot.
 * Secondary: the gradient's bottom number as close as possible to r × B (r dealt: 1, 2, 3 or ½), so that the y-intercept
 *   can be rewritten over the gradient's bottom (r = 2: 3/8 beside 5/4 = 10/8).
 * Thirds (repertoire, row 3a; each reads B, so a step up the ladder restarts it):
 *   gradient-top:    the gradient's top number (ignoring its sign) near B;
 *   at-bottom:       y when x = B, near a whole number;
 *   crossing-bottom: the bottom number of where the line crosses the x-axis, near B.
 *
 * Both bottoms are kept by a unit shift (the y-intercept's) or a unit tilt (the gradient's), and every mirror in an
 * axis keeps both; a nudge of b moves both by one. The ladder is the size of B: under the law each unit of b costs half
 * a bit, so a bigger shared bottom is dearer at every step (the coordinator: a real, increasingly expensive ladder).
 */
import { Qn, q, ref } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export type BottomsParams = { r: "1" | "2" | "3" | "1/2" };
const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const EXAMPLE: Record<BottomsParams["r"], string> = {
  "1": "the same as the y-intercept's (3/8 beside 5/8)",
  "2": "2 times the y-intercept's (3/8 beside 5/4, which is 10/8)",
  "3": "3 times the y-intercept's (5/12 beside 3/4, which is 9/12)",
  "1/2": "half the y-intercept's (3/4 beside 5/8, which you can write as 6/8 beside 5/8)",
};
const shape: Shape<BottomsParams> = {
  main: {
    ...more<BottomsParams>("bottom", "the y-intercept's bottom number", "", "si"),
    sentence: () => "Write the gradient and the y-intercept as fractions in lowest terms (10/4 is 5/2; a whole number has bottom number 1). Primary: the y-intercept's bottom number: bigger is better.",
  },
  tieBreakers: [
    { ...distance<BottomsParams>("match", "the gradient's bottom number near r times the y-intercept's", "", "si"),
      sentence: p => `the gradient's bottom number as close as possible to ${EXAMPLE[p.r]}.` },
    distance<BottomsParams>("gradient-top", "the gradient's top number near the y-intercept's bottom number",
      "the gradient's top number (ignoring a minus sign) as close as possible to the y-intercept's bottom number.", "si"),
    distance<BottomsParams>("at-bottom", "y when x is the y-intercept's bottom number, near a whole number",
      "y when x is the y-intercept's bottom number, as close as possible to a whole number.", "si"),
    distance<BottomsParams>("crossing-bottom", "the crossing's bottom number near the y-intercept's",
      "the bottom number of where the line crosses the x-axis as close as possible to the y-intercept's bottom number (a line that never crosses counts as worst).", "crossing"),
  ],
};

export const matchingBottoms = family<BottomsParams>("matching-bottoms", "Matching Bottoms", ["si", "crossing"], shape,
  onRationals((["1", "2", "3", "1/2"] as const).map(r => ({ r }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c"), xRef = ref("crossing", "x0");
    const mv = ctx.read(mRef), cv = ctx.read(cRef), xv = ctx.read(xRef);
    const m = num(mv), c = num(cv);
    if (m === null || c === null) return allUndefined(ctx, shape, cv, cRef);
    const B = c.d, want = Qn.mul(q(B), Qn.parse(p.r));
    ctx.term("bottom", `the y-intercept ${Qn.toWire(c)} has bottom number ${B}`, q(B), [cRef]);
    ctx.term("match", `the gradient ${Qn.toWire(m)} has bottom ${m.d}; ${p.r} × ${B} = ${Qn.toWire(want)}`, Qn.abs(Qn.sub(q(m.d), want)), [cRef, mRef]);
    ctx.term("gradient-top", `the gradient's top ${abs(m.n)} against ${B}`, q(abs(abs(m.n) - B)), [cRef, mRef]);
    const y = Qn.add(Qn.mul(m, q(B)), c), w = Qn.floor(Qn.add(y, q(1, 2)));
    ctx.term("at-bottom", `y at x = ${B} is ${Qn.toWire(y)}`, Qn.abs(Qn.sub(y, q(w))), [cRef, mRef]);
    const x = num(xv);
    ctx.term("crossing-bottom", x === null ? "a flat line never crosses" : `the crossing ${Qn.toWire(x)} has bottom ${x.d}, against ${B}`,
      x === null ? { undefined: "a flat line never crosses the x-axis" } : q(abs(x.d - B)), [cRef, xRef]);
    ctx.mark({ kind: "focus", ref: cRef, term: "bottom" });
    ctx.mark({ kind: "focus", ref: mRef, term: "match" });
    ctx.mark({ kind: "note", ref: mRef, term: "match", text: `wanted bottom ${Qn.toWire(want)}` });
  });
