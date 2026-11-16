/**
 * Square Fraction Intercept: a fraction-native family in the nearest-target shape (design-principles.md principle 3b;
 * the owner, 16 Nov: rules "crafted with rationals in mind from the beginning"). It is in no pool until the coordinator
 * has read its walk-through.
 *
 * Reading: the size of the y-intercept |c|. Desired values: a fraction with the dealt bottom number d in lowest terms,
 * times itself: (j/d)² with j not a multiple of d (d = 3: 1/9, 4/9, 16/9, 25/9, 49/9, …; never a whole number). Every
 * line has a nearest one (a tie goes to the bigger j), and they spread out as they grow, so there is no crowding.
 *
 * Layers: (main) the top number j of the fraction that was squared, bigger better; (secondary) how far |c| is from
 * (j/d)²; and three thirds, each tying the gradient to j/d: how far the gradient's size is from j/d (the line's own
 * gradient is the square root of its intercept), how far the gradient's top number is from j, and how far the gradient
 * times d is from a whole number.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { distanceToWhole, isqrt } from "./numbers.ts";
import { onRationals } from "./rational.ts";

export const SQUARE_BOTTOMS = [2, 3, 5, 7] as const;
export type SquareInterceptParams = { d: (typeof SQUARE_BOTTOMS)[number] };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** The square (j/d)² nearest x ≥ 0, with j ≥ 1 and gcd(j, d) = 1 (a tie goes to the bigger j). */
export function nearestSquareFraction(x: Q, d: number): { j: bigint; s: Q } {
  const D = BigInt(d), est = isqrt(Qn.floor(Qn.mul(x, q(D * D))));
  let best: { j: bigint; dist: Q } | null = null;
  for (let j = est - 2n; j <= est + 3n; j++) {
    if (j < 1n || gcd(j, D) !== 1n) continue;
    const dist = Qn.abs(Qn.sub(x, q(j * j, D * D)));
    if (!best || Qn.cmp(dist, best.dist) < 0 || (Qn.cmp(dist, best.dist) === 0 && j > best.j)) best = { j, dist };
  }
  return { j: best!.j, s: q(best!.j * best!.j, D * D) };
}

const NAME: Record<number, string> = { 2: "halves", 3: "thirds", 5: "fifths", 7: "sevenths" };
const examples = (d: number) => [1, 2, d + 1, d + 2].filter(j => gcd(BigInt(j), BigInt(d)) === 1n).slice(0, 3)
  .map(j => `(${j}/${d}) × (${j}/${d}) = ${j * j}/${d * d}`).join("; ");
const shape: Shape<SquareInterceptParams> = {
  main: {
    ...more<SquareInterceptParams>("root-top", "the top number of the fraction whose square is nearest the y-intercept's size", "", "si"),
    sentence: p => `The targets are the squares of the ${NAME[p.d]} that are not whole numbers: a fraction with bottom number ${p.d} in lowest terms, times itself (${examples(p.d)}; …). Find the target nearest the y-intercept, ignoring its sign (halfway between two goes to the bigger). Score: the top number of the fraction that was squared (for ${(p.d + 1) ** 2}/${p.d * p.d}, ${p.d + 1}); bigger is better.`,
  },
  tieBreakers: [
    distance<SquareInterceptParams>("near", "the y-intercept's size close to its target",
      "Then: how far the y-intercept (ignoring its sign) is from that target; smaller is better.", "si"),
    distance<SquareInterceptParams>("root-gradient", "the gradient's size close to the fraction that was squared",
      "Then: how far the gradient (ignoring its sign) is from the fraction that was squared; smaller is better.", "si"),
    distance<SquareInterceptParams>("top-match", "the gradient's top number close to the squared fraction's top",
      "Then: write the gradient as a fraction in lowest terms (a whole number 4 is 4/1). How far is its top number (ignoring its sign) from the top number of the fraction that was squared? Smaller is better.", "si"),
    { ...distance<SquareInterceptParams>("in-parts", "the gradient a whole number of parts of the dealt size", "", "si"),
      sentence: p => `Then: multiply the gradient by ${p.d}. How far is that from the nearest whole number? Smaller is better.` },
  ],
};

export const squareIntercept = family<SquareInterceptParams>("square-intercept", "Square Fraction Intercept", ["si"], shape,
  onRationals(SQUARE_BOTTOMS.map(d => ({ d }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no y-intercept
    const c = num(ctx.read(cRef))!;
    const size = Qn.abs(c), { j, s } = nearestSquareFraction(size, p.d), root = q(j, BigInt(p.d));
    ctx.term("root-top", `the y-intercept's size ${Qn.toWire(size)} is nearest ${Qn.toWire(s)} = (${Qn.toWire(root)})²: top number ${j}`, q(j), [cRef]);
    ctx.term("near", `${Qn.toWire(size)} is ${Qn.toWire(Qn.abs(Qn.sub(size, s)))} from ${Qn.toWire(s)}`, Qn.abs(Qn.sub(size, s)), [cRef]);
    const mSize = Qn.abs(m);
    ctx.term("root-gradient", `the gradient's size ${Qn.toWire(mSize)} against ${Qn.toWire(root)}`, Qn.abs(Qn.sub(mSize, root)), [mRef, cRef]);
    ctx.term("top-match", `the gradient's top ${abs(m.n)} against ${j}`, q(abs(abs(m.n) - j)), [mRef, cRef]);
    ctx.term("in-parts", `${Qn.toWire(m)} × ${p.d} is ${Qn.toWire(distanceToWhole(Qn.mul(m, q(BigInt(p.d)))))} from a whole number`,
      distanceToWhole(Qn.mul(m, q(BigInt(p.d)))), [mRef]);
    ctx.mark({ kind: "focus", ref: cRef });
    ctx.mark({ kind: "focus", ref: mRef });
  });
