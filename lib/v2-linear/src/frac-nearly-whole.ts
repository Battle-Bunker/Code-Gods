/**
 * Nearly Whole: a fraction-native family in the nearest-target shape (design-principles.md principle 3b). It is in no
 * pool until the coordinator has read its walk-through.
 *
 * Reading: the fraction part g of the dealt number's size (|gradient| or |y-intercept|): what is left after its whole
 * number (|−17/6| = 2 + 5/6: g = 5/6). Targets: the fractions j short of their bottom number, 1 − j/n (j = 1: 1/2, 2/3,
 * 3/4, …; j = 2: 1/3, 3/5, 5/7, …), which crowd towards 1 without reaching it. Every line has a nearest target (a tie goes
 * to the bigger bottom), so there is no cliff; a whole number (g = 0) is nearest the first target.
 *
 * Layers: (main) the target's bottom number n, bigger better (no top: a bigger bottom is always possible, and rarer under
 * the law); (secondary) how far g is from the target; and three thirds, each a relation between n and the other number
 * of the line: its whole part against n (the bigger divided by the smaller), its top number against n, and its bottom
 * number against n.
 *
 * Robust (principle 11): a whole shift or tilt and every reflection but the diagonal keep g; a nudge of one coefficient
 * moves g by 1 over the bottom, so the nearest target moves to a neighbour with about half or twice the bottom.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import { allUndefined, distance, family, more, num, type Shape } from "./layers.ts";
import { onRationals } from "./rational.ts";

export type NearlyParams = { of: "m" | "c"; j: 1 | 2 };
export const NEARLY_PARAMS: readonly NearlyParams[] = [{ of: "m", j: 1 }, { of: "c", j: 1 }, { of: "m", j: 2 }, { of: "c", j: 2 }];

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** The bottoms n allowed for j: n > j with gcd(n, j) = 1 (so 1 − j/n is in lowest terms). */
const allowed = (n: bigint, j: bigint) => n > j && gcd(n, j) === 1n;
/** The target 1 − j/n nearest g in [0, 1) (a tie goes to the bigger n), and its bottom n. */
export function nearestShortTarget(g: Q, j: number): { n: bigint; t: Q } {
  const J = BigInt(j), t = (n: bigint) => q(n - J, n);
  let first = J + 1n;
  while (!allowed(first, J)) first++;
  if (Qn.cmp(g, t(first)) <= 0) return { n: first, t: t(first) };
  // 1 − j/n = g at n = j/(1 − g): look at the allowed bottoms around it.
  const est = Qn.floor(Qn.div(q(J), Qn.sub(q(1), g)));
  let best: { n: bigint; t: Q; d: Q } | null = null;
  for (let n = est - 2n * J - 1n; n <= est + 2n * J + 2n; n++) {
    if (!allowed(n, J)) continue;
    const d = Qn.abs(Qn.sub(g, t(n)));
    if (!best || Qn.cmp(d, best.d) < 0 || (Qn.cmp(d, best.d) === 0 && n > best.n)) best = { n, t: t(n), d };
  }
  return { n: best!.n, t: best!.t };
}

const NAMES = { m: "gradient", c: "y-intercept" } as const;
const OTHER = { m: "c", c: "m" } as const;
const targetsOf = (j: number) => (j === 1 ? "1/2, 2/3, 3/4, 4/5, … (each 1 short of its bottom number)" : "1/3, 3/5, 5/7, 7/9, … (each 2 short of its bottom number)");
const shape: Shape<NearlyParams> = {
  main: {
    ...more<NearlyParams>("bottom", "the bottom number of the target nearest the fraction part", "", "si"),
    sentence: p => `Take the ${NAMES[p.of]}, ignoring its sign, and its fraction part: what is left after the whole number (17/6 = 2 + 5/6: the fraction part is 5/6; a whole number's is 0). The targets are ${targetsOf(p.j)}. Find the target nearest the fraction part (halfway between two goes to the bigger bottom). Score: that target's bottom number; bigger is better.`,
  },
  tieBreakers: [
    distance<NearlyParams>("near", "the fraction part close to its target", "Then: how far the fraction part is from that target; smaller is better.", "si"),
    { ...distance<NearlyParams>("whole-ratio", "the other number's whole part in proportion to the target's bottom", "", "si"),
      sentence: p => `Then: take the ${NAMES[OTHER[p.of]]}'s whole part (the whole number at or below its size) and the target's bottom number; divide the bigger by the smaller. Smaller is better (a whole part of 0 counts as worst).` },
    { ...distance<NearlyParams>("top-near", "the other number's top close to the target's bottom", "", "si"),
      sentence: p => `Then: write the ${NAMES[OTHER[p.of]]} as a fraction in lowest terms. How far is its top number (ignoring its sign) from the target's bottom number? Smaller is better.` },
    { ...distance<NearlyParams>("bottom-near", "the other number's bottom close to the target's bottom", "", "si"),
      sentence: p => `Then: write the ${NAMES[OTHER[p.of]]} as a fraction in lowest terms. How far is its bottom number from the target's bottom number? Smaller is better.` },
  ],
};

export const nearlyWhole = family<NearlyParams>("nearly-whole", "Nearly Whole", ["si"], shape, onRationals([...NEARLY_PARAMS]), (ctx, p) => {
  const mRef = ref("si", "m"), cRef = ref("si", "c");
  const mv = ctx.read(mRef), m = num(mv);
  if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient or y-intercept
  const c = num(ctx.read(cRef))!;
  const [x, y] = p.of === "m" ? [m, c] : [c, m];
  const [xRef, yRef] = p.of === "m" ? [mRef, cRef] : [cRef, mRef];
  const size = Qn.abs(x), g = Qn.sub(size, q(Qn.floor(size)));
  const { n, t } = nearestShortTarget(g, p.j);
  ctx.term("bottom", `fraction part ${Qn.toWire(g)}: nearest target ${Qn.toWire(t)}`, q(n), [xRef]);
  ctx.term("near", `${Qn.toWire(g)} is ${Qn.toWire(Qn.abs(Qn.sub(g, t)))} from ${Qn.toWire(t)}`, Qn.abs(Qn.sub(g, t)), [xRef]);
  const W = Qn.floor(Qn.abs(y));
  ctx.term("whole-ratio", W === 0n ? "the other number's whole part is 0" : `${W} and ${n}`,
    W === 0n ? { undefined: "the other number's whole part is 0" } : (W > n ? q(W, n) : q(n, W)), [xRef, yRef]);
  ctx.term("top-near", `top ${abs(y.n)} against ${n}`, q(abs(abs(y.n) - n)), [xRef, yRef]);
  ctx.term("bottom-near", `bottom ${y.d} against ${n}`, q(abs(y.d - n)), [xRef, yRef]);
  ctx.mark({ kind: "focus", ref: xRef });
  ctx.mark({ kind: "focus", ref: yRef });
});
