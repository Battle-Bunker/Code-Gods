/**
 * Twin Fractions: a fraction-native family that replaces Divisibility Ladder (the owner, 15 Nov). It is in no pool
 * until the coordinator has read its walk-through (docs/engine-v2/fraction-families.md).
 *
 * Main part (both numbers of the line; no top): write the gradient m and the y-intercept c each as a whole part plus a
 * fraction part in [0, 1) (7/3 = 2 + 1/3, −5/4 = −2 + 3/4). The gap between the two fraction parts, g = |{m} − {c}|, should
 * be as close as possible to the dealt target τ, an irrational number between 0 and 1. No fraction equals τ, so a closer
 * gap is always possible, and every closer gap is rarer under the law (its fractions need bigger bottoms). Score: the
 * plain distance |g − τ|, smaller better.
 *
 * Why it is robust (design-principles.md principle 11): adding a whole number to m or c (a unit tilt or shift, a pivot
 * about a whole x) leaves both fraction parts as they are, and so does the reflection in the x-axis; a nudge of one
 * coefficient of ax + by + c = 0 by 1 moves m or c by 1/b, so the gap moves by about 1/b and a good state keeps much of
 * its value. Only half-unit moves and the other reflections scramble it.
 *
 * Why it is fraction-native (principle 13): every whole-number line has gap 0, as far from τ as τ itself, so its good
 * states all have fractional coefficients, and it reads fraction parts, tops and bottoms.
 *
 * Tie-breakers (principle 3, row 3a): each reads the gap P/Q in lowest terms that the main part reached, so a step to a
 * closer gap changes P and Q and restarts each climb. Three forms: a distance (the gradient's whole part to Q), a ratio
 * (the whole parts' ratio to the gap itself) and a remainder (the y-intercept's whole part divided by Q).
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

/** The dealt targets: irrational numbers between 0 and 1, to 30 decimal places, with how the card names them. */
export const TWIN_TARGETS = {
  golden: { digits: "618033988749894848204586834366", name: "0.6180339887… (the golden ratio minus 1)" },
  root2: { digits: "414213562373095048801688724210", name: "0.4142135623… (the square root of 2, minus 1)" },
  root3: { digits: "732050807568877293527446341506", name: "0.7320508075… (the square root of 3, minus 1)" },
  root5: { digits: "236067977499789696409173668732", name: "0.2360679774… (the square root of 5, minus 2)" },
  pi: { digits: "141592653589793238462643383280", name: "0.1415926535… (pi minus 3)" },
} as const;
export type TwinParams = { t: keyof typeof TWIN_TARGETS };
const tau = (p: TwinParams): Q => q(BigInt(TWIN_TARGETS[p.t].digits), 10n ** 30n);

/** The fraction part of x: x minus the whole number at or below it, so always in [0, 1) (−5/4 → 3/4). */
export const fractionPart = (x: Q): Q => Qn.sub(x, q(Qn.floor(x)));
const wholePart = (x: Q): bigint => Qn.floor(x);
const absB = (x: bigint): bigint => (x < 0n ? -x : x);

const FRACTION_PARTS = "Write the gradient and the y-intercept each as a whole number plus a fraction part between 0 and 1 " +
  "(7/3 = 2 + 1/3; −5/4 = −2 + 3/4; a whole number has fraction part 0).";
const shape: Shape<TwinParams> = {
  main: {
    // Valued as 1/distance, a size with no top (value.ts fits sizes on a log ramp): the same order as the distance.
    ...more<TwinParams>("twin", "the gap between the two fraction parts close to the target (1 over the distance)", "", "si"),
    sentence: p => `${FRACTION_PARTS} The gap between the two fraction parts (the bigger minus the smaller) should be as close as possible to ${TWIN_TARGETS[p.t].name}. No fraction is exactly that number, so a closer gap is always possible. Score: the distance between the gap and that number; smaller is better (each halving of the distance is a step up).`,
  },
  tieBreakers: [
    distance<TwinParams>("whole-to-bottom", "the gradient's whole part close to the gap's bottom number",
      "Write the gap as a fraction in lowest terms, P/Q. The gradient's whole part (ignoring its sign) should be as close as possible to Q.", "si"),
    distance<TwinParams>("ratio-echo", "the whole parts' ratio close to the gap",
      "The y-intercept's whole part divided by the gradient's whole part should be as close as possible to the gap itself (a gradient whose whole part is 0 counts as worst).", "si"),
    more<TwinParams>("remainder", "the y-intercept's whole part leaves a big remainder when divided by the gap's bottom number",
      "Write the gap as P/Q in lowest terms. Divide the y-intercept's whole part (ignoring its sign) by Q: the remainder should be as big as possible (at most Q − 1).", "si"),
  ],
};

export const twinFractions = family<TwinParams>("twin-fractions", "Twin Fractions", ["si"], shape,
  onRationals((Object.keys(TWIN_TARGETS) as TwinParams["t"][]).map(t => ({ t }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient
    const c = num(ctx.read(cRef))!;
    const fm = fractionPart(m), fc = fractionPart(c);
    const g = Qn.abs(Qn.sub(fm, fc));
    const d = Qn.abs(Qn.sub(g, tau(p)));
    ctx.term("twin", `fraction parts ${Qn.toWire(fm)} and ${Qn.toWire(fc)}: gap ${Qn.toWire(g)}, ${Qn.toNumber(d).toPrecision(3)} from the target (1 over that)`,
      Qn.inv(d), [mRef, cRef]);
    const Qd = g.d, wm = wholePart(m), wc = wholePart(c);
    ctx.term("whole-to-bottom", `the gradient's whole part ${wm} and the gap's bottom ${Qd}`, q(absB(absB(wm) - Qd)), [mRef, cRef]);
    ctx.term("ratio-echo", wm === 0n ? "the gradient's whole part is 0: no ratio" : `${wc}/${wm} against the gap ${Qn.toWire(g)}`,
      wm === 0n ? { undefined: "the gradient's whole part is 0" } : Qn.abs(Qn.sub(q(wc, wm), g)), [mRef, cRef]);
    ctx.term("remainder", `${absB(wc)} divided by the gap's bottom ${Qd} leaves ${absB(wc) % Qd}`, q(absB(wc) % Qd), [mRef, cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
  });
