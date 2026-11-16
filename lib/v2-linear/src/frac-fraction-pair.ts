/**
 * Fraction Pair: Fraction Gradient with a deeper level (the coordinator, 16 Nov: "find a level that is rarer to climb
 * without becoming a cliff"). In no pool until the coordinator has read its walk-through.
 *
 * Reading: both numbers of the line. Desired values: the fractions with the dealt bottom number d in lowest terms (never
 * whole). Find the one nearest the gradient (top k₁) and the one nearest the y-intercept (top k₂).
 *
 * Layers: (main) the smaller of |k₁| and |k₂|, bigger better: both numbers must be big at once, about twice the rarity
 * of one; (secondary) the bigger of the two distances; and three thirds, each relating the two targets: how far apart
 * their top numbers are, how far the bigger top is from a multiple of the smaller, and the bigger top divided by the
 * smaller.
 */
import { Qn, q, ref } from "@workspace/v2-core";
import { nearestWithBottom } from "./frac-fraction-gradient.ts";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export const PAIR_BOTTOMS = [2, 3, 5, 7] as const;
export type FractionPairParams = { d: (typeof PAIR_BOTTOMS)[number] };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const NAME: Record<number, string> = { 2: "halves", 3: "thirds", 5: "fifths", 7: "sevenths" };
const SINGLE: Record<number, string> = { 2: "half", 3: "third", 5: "fifth", 7: "seventh" };
const examples = (d: number) => [1, 2, d + 1, 2 * d + 1].filter(k => k % d !== 0 && !(d === 2 && k % 2 === 0)).map(k => `${k}/${d}`).join(", ");

const shape: Shape<FractionPairParams> = {
  main: {
    ...more<FractionPairParams>("smaller-top", "the smaller top number of the two nearest fractions", "", "si"),
    sentence: p => `The targets are the ${NAME[p.d]} that are not whole numbers: fractions with bottom number ${p.d} in lowest terms (${examples(p.d)}, …, and the same with a minus sign). Find the ${SINGLE[p.d]} nearest the gradient and the ${SINGLE[p.d]} nearest the y-intercept (halfway between two goes to the bigger top number, or between −1/2 and 1/2 to 1/2). Score: the smaller of their two top numbers, ignoring signs; bigger is better.`,
  },
  tieBreakers: [
    distance<FractionPairParams>("near", "both numbers close to their targets",
      "Then: how far the gradient is from its target and how far the y-intercept is from its target; the bigger of the two distances, smaller is better.", "si"),
    distance<FractionPairParams>("top-gap", "the two targets' top numbers close together",
      "Then: how far apart the two targets' top numbers are (ignoring signs); smaller is better.", "si"),
    distance<FractionPairParams>("top-multiple", "the bigger top close to a multiple of the smaller",
      "Then: how far the bigger of the two top numbers is from the nearest multiple of the smaller (ignoring signs); smaller is better.", "si"),
    distance<FractionPairParams>("top-ratio", "the bigger top divided by the smaller",
      "Then: the bigger of the two top numbers divided by the smaller (ignoring signs); smaller is better.", "si"),
  ],
};

export const fractionPair = family<FractionPairParams>("fraction-pair", "Fraction Pair", ["si"], shape,
  onRationals(PAIR_BOTTOMS.map(d => ({ d }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient or y-intercept
    const c = num(ctx.read(cRef))!;
    const g = nearestWithBottom(m, p.d), y = nearestWithBottom(c, p.d);
    const k1 = abs(g.k), k2 = abs(y.k), lo = k1 < k2 ? k1 : k2, hi = k1 < k2 ? k2 : k1;
    ctx.term("smaller-top", `the gradient is nearest ${Qn.toWire(g.t)}, the y-intercept ${Qn.toWire(y.t)}: smaller top ${lo}`, q(lo), [mRef, cRef]);
    const dm = Qn.abs(Qn.sub(m, g.t)), dc = Qn.abs(Qn.sub(c, y.t));
    ctx.term("near", `${Qn.toWire(dm)} and ${Qn.toWire(dc)} from their targets`, Qn.cmp(dm, dc) >= 0 ? dm : dc, [mRef, cRef]);
    ctx.term("top-gap", `tops ${k1} and ${k2}`, q(hi - lo), [mRef, cRef]);
    const r = hi % lo, off = r < lo - r ? r : lo - r;
    ctx.term("top-multiple", `${hi} is ${off} from a multiple of ${lo}`, q(off), [mRef, cRef]);
    ctx.term("top-ratio", `${hi} ÷ ${lo}`, q(hi, lo), [mRef, cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
  });
