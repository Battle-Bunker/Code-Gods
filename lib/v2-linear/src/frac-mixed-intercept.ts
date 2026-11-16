/**
 * Mixed Intercept: a fraction-native family in the nearest-target shape (design-principles.md principle 3b). In no pool
 * until the coordinator has read its walk-through.
 *
 * Reading: the size of the y-intercept |c|. Desired values: the mixed numbers with the dealt fraction part r/d ("and a
 * third": 1/3, 1 1/3, 2 1/3, …), one between each pair of whole numbers and never whole. Every line has a nearest one
 * (a tie goes to the bigger), they are 1 apart, and a shift of the line by 1 lands exactly on the next one, so there is
 * no cliff and no crowding.
 *
 * Layers: (main) the whole part w of the nearest target, bigger better; (secondary) how far |c| is from it; and three
 * thirds, each tying the gradient to the same mixed number w + r/d: how far the gradient's fraction part is from r/d,
 * how far the gradient's whole part is from w, and the gradient's size in proportion to the target (the bigger divided
 * by the smaller).
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export type MixedParams = { r: number; d: number };
export const MIXED_PARTS: readonly MixedParams[] = [{ r: 1, d: 2 }, { r: 1, d: 3 }, { r: 2, d: 5 }, { r: 3, d: 7 }];

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const fractionPart = (x: Q): Q => Qn.sub(x, q(Qn.floor(x)));

/** The mixed number w + r/d (w ≥ 0) nearest x ≥ 0; a tie goes to the bigger. */
export function nearestMixed(x: Q, p: MixedParams): { w: bigint; t: Q } {
  const f = q(BigInt(p.r), BigInt(p.d)), w0 = Qn.floor(Qn.sub(x, f));
  let best: { w: bigint; dist: Q } | null = null;
  for (let w = w0 - 1n; w <= w0 + 2n; w++) {
    if (w < 0n) continue;
    const dist = Qn.abs(Qn.sub(x, Qn.add(q(w), f)));
    if (!best || Qn.cmp(dist, best.dist) < 0 || (Qn.cmp(dist, best.dist) === 0 && w > best.w)) best = { w, dist };
  }
  return { w: best!.w, t: Qn.add(q(best!.w), f) };
}

const PART: Record<string, string> = { "1/2": "a half", "1/3": "a third", "2/5": "two fifths", "3/7": "three sevenths" };
const part = (p: MixedParams) => PART[`${p.r}/${p.d}`] ?? `${p.r}/${p.d}`;
const shape: Shape<MixedParams> = {
  main: {
    ...more<MixedParams>("whole", "the whole part of the mixed number nearest the y-intercept's size", "", "si"),
    sentence: p => `The targets are the numbers "something and ${part(p)}": ${p.r}/${p.d}, 1 ${p.r}/${p.d}, 2 ${p.r}/${p.d}, 3 ${p.r}/${p.d}, … (a whole number plus ${p.r}/${p.d}). Find the target nearest the y-intercept, ignoring its sign (halfway between two goes to the bigger). Score: its whole number (for 3 ${p.r}/${p.d}, 3); bigger is better.`,
  },
  tieBreakers: [
    distance<MixedParams>("near", "the y-intercept's size close to its target",
      "Then: how far the y-intercept (ignoring its sign) is from that target; smaller is better.", "si"),
    { ...distance<MixedParams>("gradient-part", "the gradient's fraction part close to the dealt part", "", "si"),
      sentence: p => `Then: take the gradient, ignoring its sign, and its fraction part (what is left after the whole number: 17/6 = 2 + 5/6, so 5/6). How far is that from ${p.r}/${p.d}? Smaller is better.` },
    distance<MixedParams>("gradient-whole", "the gradient's whole part close to the target's whole number",
      "Then: how far the gradient's whole part (the whole number at or below its size) is from the target's whole number; smaller is better.", "si"),
    distance<MixedParams>("gradient-ratio", "the gradient's size in proportion to the target",
      "Then: take the gradient's size (ignoring its sign) and the target; divide the bigger by the smaller. Smaller is better (a flat line counts as worst).", "si"),
  ],
};

export const mixedIntercept = family<MixedParams>("mixed-intercept", "Mixed Intercept", ["si"], shape, onRationals([...MIXED_PARTS]), (ctx, p) => {
  const mRef = ref("si", "m"), cRef = ref("si", "c");
  const mv = ctx.read(mRef), m = num(mv);
  if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no y-intercept
  const c = num(ctx.read(cRef))!;
  const size = Qn.abs(c), { w, t } = nearestMixed(size, p), f = q(BigInt(p.r), BigInt(p.d));
  ctx.term("whole", `the y-intercept's size ${Qn.toWire(size)} is nearest ${w} ${p.r}/${p.d}`, q(w), [cRef]);
  ctx.term("near", `${Qn.toWire(size)} is ${Qn.toWire(Qn.abs(Qn.sub(size, t)))} from ${Qn.toWire(t)}`, Qn.abs(Qn.sub(size, t)), [cRef]);
  const ms = Qn.abs(m);
  ctx.term("gradient-part", `the gradient's fraction part ${Qn.toWire(fractionPart(ms))} against ${p.r}/${p.d}`, Qn.abs(Qn.sub(fractionPart(ms), f)), [mRef, cRef]);
  ctx.term("gradient-whole", `the gradient's whole part ${Qn.floor(ms)} against ${w}`, q(abs(Qn.floor(ms) - w)), [mRef, cRef]);
  ctx.term("gradient-ratio", m.n === 0n ? "a flat line" : `${Qn.toWire(ms)} against ${Qn.toWire(t)}`,
    m.n === 0n ? { undefined: "a flat line" } : (Qn.cmp(ms, t) >= 0 ? Qn.div(ms, t) : Qn.div(t, ms)), [mRef, cRef]);
  ctx.mark({ kind: "focus", ref: cRef });
  ctx.mark({ kind: "focus", ref: mRef });
});
