/**
 * Golden Part: a fraction-native line family in the owner's tree shape (design-principles.md principle 3b; owner
 * decision 46). In no pool until the coordinator has read its walk-through.
 *
 * Reading: y at x = k (k = 1, −1, 2 or −2: k times the gradient plus the y-intercept): both numbers of the line. Its
 * distance d to the nearest whole number (0 to ½) is kept by every whole shift and tilt and by the mirror in the x-axis.
 * Targets: the fractions of a dealt ladder that close in on an irrational number and never reach it:
 *   golden: 1/2, 1/3, 2/5, 3/8, 5/13, 8/21, … (each top and bottom the next Fibonacci numbers), closing in on 0.381966…;
 *   pell:   1/2, 2/5, 5/12, 12/29, 29/70, … (top and bottom: each bottom is twice the last plus the one before), on 0.414213….
 * Primary (no top: the limit is never reached): which step of the ladder is nearest d, later better.
 * Secondary: how far d is from that target T/B, counted in steps of 1/B (|d × B − T|), smaller better.
 * Thirds (each reads the target, so a step up the ladder restarts it):
 *   gradient-bottom: the gradient's bottom number near B;
 *   at-bottom:       y at x = B, near a whole number;
 *   twin:            the y-intercept's distance to its nearest whole number, near the same target.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export type GoldenParams = { ladder: "golden" | "pell"; at: 1 | -1 | 2 | -2 };
const abs = (x: bigint): bigint => (x < 0n ? -x : x);

/** The ladder's first steps (enough for any line the game can reach: bottoms past 10^40). */
export function ladderTargets(ladder: GoldenParams["ladder"]): Q[] {
  const out: Q[] = [];
  if (ladder === "golden") { let [t, b] = [1n, 2n]; for (let i = 0; i < 190; i++) { out.push(q(t, b)); [t, b] = [b - t, b + (b - t)]; } }
  else { let [t, b] = [1n, 2n]; for (let i = 0; i < 100; i++) { out.push(q(t, b)); [t, b] = [b, 2n * b + t]; } }
  return out;
}
const LADDERS = { golden: ladderTargets("golden"), pell: ladderTargets("pell") };
/** Distance from x to the nearest whole number (0 to ½). */
export const toWhole = (x: Q): Q => { const f = Qn.sub(x, q(Qn.floor(x))); return Qn.cmp(f, q(1, 2)) > 0 ? Qn.sub(Qn.ONE, f) : f; };
/** The step (1 = the first) of the ladder nearest d; halfway, the earlier step. */
export function nearestStep(d: Q, ladder: GoldenParams["ladder"]): { step: number; t: Q } {
  let best = 0, bd = Qn.abs(Qn.sub(d, LADDERS[ladder][0]!));
  for (let i = 1; i < LADDERS[ladder].length; i++) {
    const x = Qn.abs(Qn.sub(d, LADDERS[ladder][i]!));
    if (Qn.cmp(x, bd) < 0) { best = i; bd = x; }
    if (Qn.isZero(bd)) break;
  }
  return { step: best + 1, t: LADDERS[ladder][best]! };
}

const LADDER_TEXT = {
  golden: "1/2, 1/3, 2/5, 3/8, 5/13, 8/21, … (the next top is the last bottom minus the last top; the next bottom is the last bottom plus the next top). They close in on 0.381966… but never reach it",
  pell: "1/2, 2/5, 5/12, 12/29, 29/70, … (the next top is the last bottom; the next bottom is twice the last bottom plus the last top). They close in on 0.414213… but never reach it",
};
const shape: Shape<GoldenParams> = {
  main: {
    ...more<GoldenParams>("step", "which step of the ladder is nearest the reading's distance to a whole number", "", "si"),
    sentence: p => `Work out y when x is ${p.at} and how far it is from the nearest whole number (between 0 and 1/2; for 7/3 it is 1/3). The ladder of fractions is ${LADDER_TEXT[p.ladder]}. Find the step of the ladder nearest that distance (halfway between two, the earlier). Primary: which step (1/2 is step 1): later is better.`,
  },
  tieBreakers: [
    distance<GoldenParams>("close", "how far the distance is from that step, in steps of one over its bottom",
      "how far the distance is from that step's fraction, counted in steps of 1 over its bottom number (for 3/8, in eighths: 3/8 is 0 eighths away, 1/4 is 1 eighth away): fewer is better.", "si"),
    distance<GoldenParams>("gradient-bottom", "the gradient's bottom number near the step's bottom number",
      "the gradient's bottom number (as a fraction in lowest terms) as close as possible to that step's bottom number.", "si"),
    distance<GoldenParams>("at-bottom", "y when x is the step's bottom number, near a whole number",
      "y when x is that step's bottom number, as close as possible to a whole number.", "si"),
    distance<GoldenParams>("twin", "the y-intercept's distance to a whole number near the same step",
      "the y-intercept's own distance to its nearest whole number as close as possible to the same step's fraction.", "si"),
  ],
};

export const goldenPart = family<GoldenParams>("golden-part", "Golden Part", ["si"], shape,
  // Dealt on the golden ladder only: the Pell ladder's steps grow 2.4 times a step, and a greedy climber reached 34–35
  // bits for about 70⚡ (one shortcut to a bottom near 100); the golden ladder's climbers stalled near 17.
  onRationals(([1, -1, 2, -2] as const).map(at => ({ ladder: "golden" as const, at }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c"), yRef = ref("si", "y", { q: String(p.at) });
    const mv = ctx.read(mRef), yv = ctx.read(yRef);
    const y = num(yv), m = num(mv);
    if (y === null || m === null) return allUndefined(ctx, shape, yv, yRef);
    const c = num(ctx.read(cRef))!;
    const d = toWhole(y), { step, t } = nearestStep(d, p.ladder);
    ctx.term("step", `y at x = ${p.at} is ${Qn.toWire(y)}, ${Qn.toWire(d)} from a whole number: nearest step ${step}, ${Qn.toWire(t)}`, q(step), [yRef]);
    ctx.term("close", `${Qn.toWire(d)} against ${Qn.toWire(t)}: ${Qn.toWire(Qn.abs(Qn.sub(Qn.mul(d, q(t.d)), q(t.n))))} steps of 1/${t.d}`,
      Qn.abs(Qn.sub(Qn.mul(d, q(t.d)), q(t.n))), [yRef]);
    ctx.term("gradient-bottom", `the gradient ${Qn.toWire(m)} has bottom ${m.d}, ${abs(m.d - t.d)} from ${t.d}`, q(abs(m.d - t.d)), [yRef, mRef]);
    ctx.term("at-bottom", `y at x = ${t.d}`, toWhole(Qn.add(Qn.mul(m, q(t.d)), c)), [yRef, mRef, cRef]);
    ctx.term("twin", `the y-intercept ${Qn.toWire(c)} is ${Qn.toWire(toWhole(c))} from a whole number, against ${Qn.toWire(t)}`, Qn.abs(Qn.sub(toWhole(c), t)), [yRef, cRef]);
    ctx.mark({ kind: "focus", ref: yRef, term: "step" });
    ctx.mark({ kind: "note", ref: yRef, term: "close", text: `step ${step}: ${Qn.toWire(t)}` });
  });
