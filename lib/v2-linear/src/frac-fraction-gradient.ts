/**
 * Fraction Gradient: a fraction-native family in the nearest-target shape (design-principles.md principle 3b; the
 * owner, 16 Nov: rules "crafted with rationals in mind from the beginning" that "prefer non-integer rational values").
 * It is in no pool until the coordinator has read its walk-through.
 *
 * Reading: the gradient m. Desired values: the fractions with the dealt bottom number d in lowest terms (d = 7: …, −1/7,
 * 1/7, 2/7, …, 6/7, 8/7, …; never a whole number). Every gradient has a nearest one (a tie goes to the bigger top
 * number), and they are 1/d apart, so there is no cliff and no crowding.
 *
 * Layers: (main) the top number of the nearest one, ignoring its sign, bigger better; (secondary) how far the gradient
 * is from it; and three thirds, each asking about the y-intercept against that fraction k/d: how far the y-intercept is
 * from k/d itself, how far the y-intercept's bottom number is from d, and how far the y-intercept's top number is from
 * the nearest multiple of k.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export const GRADIENT_BOTTOMS = [2, 3, 5, 7] as const;
export type FractionGradientParams = { d: (typeof GRADIENT_BOTTOMS)[number] };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** The fraction k/d in lowest terms nearest x (a tie goes to the bigger |k|, then to the positive one), and its top number k. */
export function nearestWithBottom(x: Q, d: number): { k: bigint; t: Q } {
  const D = BigInt(d), base = Qn.floor(Qn.mul(x, q(D)));
  let best: { k: bigint; dist: Q } | null = null;
  for (let k = base - 2n; k <= base + 3n; k++) {
    if (gcd(k, D) !== 1n) continue;
    const dist = Qn.abs(Qn.sub(x, q(k, D)));
    if (!best || Qn.cmp(dist, best.dist) < 0 || (Qn.cmp(dist, best.dist) === 0 && (abs(k) > abs(best.k) || (abs(k) === abs(best.k) && k > 0n)))) best = { k, dist };
  }
  return { k: best!.k, t: q(best!.k, D) };
}

const NAME: Record<number, string> = { 2: "halves", 3: "thirds", 5: "fifths", 7: "sevenths" };
const examples = (d: number) => [1, 2, d + 1, 2 * d + 1].filter(k => gcd(BigInt(k), BigInt(d)) === 1n).map(k => `${k}/${d}`).join(", ");
const shape: Shape<FractionGradientParams> = {
  main: {
    ...more<FractionGradientParams>("top", "the top number of the nearest fraction with the dealt bottom", "", "si"),
    sentence: p => `The targets are the ${NAME[p.d]} that are not whole numbers: fractions with bottom number ${p.d} in lowest terms (${examples(p.d)}, …, and the same with a minus sign). Find the one nearest the gradient (halfway between two goes to the bigger top number, or between −1/2 and 1/2 to 1/2). Score: its top number, ignoring the sign; bigger is better.`,
  },
  tieBreakers: [
    distance<FractionGradientParams>("near", "the gradient close to its target",
      "Then: how far the gradient is from that target; smaller is better.", "si"),
    distance<FractionGradientParams>("echo", "the y-intercept close to the same target",
      "Then: how far the y-intercept is from that same target; smaller is better.", "si"),
    { ...distance<FractionGradientParams>("bottom-match", "the y-intercept's bottom number close to the dealt bottom", "", "si"),
      sentence: p => `Then: write the y-intercept as a fraction in lowest terms (a whole number 4 is 4/1). How far is its bottom number from ${p.d}? Smaller is better.` },
    distance<FractionGradientParams>("top-multiple", "the y-intercept's top number close to a multiple of the target's top",
      "Then: write the y-intercept as a fraction in lowest terms. How far is its top number (ignoring its sign) from the nearest multiple of the target's top number? Smaller is better.", "si"),
  ],
};

export const fractionGradient = family<FractionGradientParams>("fraction-gradient", "Fraction Gradient", ["si"], shape,
  onRationals(GRADIENT_BOTTOMS.map(d => ({ d }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient
    const c = num(ctx.read(cRef))!;
    const { k, t } = nearestWithBottom(m, p.d);
    ctx.term("top", `the gradient ${Qn.toWire(m)} is nearest ${Qn.toWire(t)}: top number ${abs(k)}`, q(abs(k)), [mRef]);
    ctx.term("near", `${Qn.toWire(m)} is ${Qn.toWire(Qn.abs(Qn.sub(m, t)))} from ${Qn.toWire(t)}`, Qn.abs(Qn.sub(m, t)), [mRef]);
    ctx.term("echo", `the y-intercept ${Qn.toWire(c)} is ${Qn.toWire(Qn.abs(Qn.sub(c, t)))} from ${Qn.toWire(t)}`, Qn.abs(Qn.sub(c, t)), [mRef, cRef]);
    ctx.term("bottom-match", `the y-intercept's bottom ${c.d} against ${p.d}`, q(abs(c.d - BigInt(p.d))), [cRef]);
    const K = abs(k), r = abs(c.n) % K, off = r < K - r ? r : K - r;
    ctx.term("top-multiple", `the y-intercept's top ${abs(c.n)} is ${off} from a multiple of ${K}`, q(off), [mRef, cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
  });
