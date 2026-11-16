/**
 * Repeating Bottom: a fraction-native family in the nearest-target shape (design-principles.md principle 3b). It is in
 * no pool until the coordinator has read its walk-through.
 *
 * Reading (both numbers of the line): the common bottom L of the gradient and the y-intercept in lowest terms, the
 * smallest number both bottoms divide into (5/6 and 3/4: 12; a whole number n is n/1). For a line ax + by + c = 0 with
 * gcd(a, b, c) = 1 and b > 0 it is b itself, so whole moves, three of the four reflections and a nudge of a or c keep
 * it, and a nudge of b moves it by 1.
 *
 * Targets: one less than a power of the dealt base B, T = Bⁿ − 1 (B = 2: 3, 7, 15, 31, …; B = 3: 2, 8, 26, 80, …), the
 * bottoms of the fractions whose digits in base B repeat in blocks of n (in base 10, 1/99 = 0.010101…). Every line has a nearest
 * target (a tie goes to the bigger), so there is no cliff.
 *
 * Layers: (main) the nearest target's power n, bigger better (valued by its rarity, about log₂ B bits a level: the
 * target itself would be valued on a straight line, exponential in the level); (secondary) how far L is from T; and three thirds, each
 * a relation between T and another dimension of the line: the x-intercept times T against the nearest whole number,
 * the gradient's top against the repunit T/(B − 1) (11…1 in base B), and the remainder of the y-intercept's whole part
 * divided by the power n.
 */
import { Qn, q, ref } from "@workspace/v2-core";
import { allUndefined, distance, family, ladder, more, num, type Shape } from "./layers.ts";
import { fromMC, type LineState } from "./line.ts";
import { distanceToWhole } from "./numbers.ts";
import { onRationals } from "./rational.ts";

export const REPEATING_BASES = [2, 3, 5, 6, 7] as const;
export type RepeatingParams = { B: (typeof REPEATING_BASES)[number] };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** The target Bⁿ − 1 nearest L ≥ 1, and its power n (targets start at n = 1, or n = 2 for B = 2, so every one is ≥ 2). */
export function nearestRepeatTarget(L: bigint, B: bigint): { T: bigint; n: number } {
  let n = B === 2n ? 2 : 1, T = B ** BigInt(n) - 1n;
  for (;;) {
    const next = T * B + B - 1n;            // B^(n+1) − 1
    // Move up while the next target is at least as close (a tie goes to the bigger).
    if (next - L <= abs(L - T)) { T = next; n++; } else return { T, n };
  }
}

const targetList = (B: number) => B === 2 ? "3, 7, 15, 31, … (one less than 4, 8, 16, 32, …)"
  : `${B - 1}, ${B * B - 1}, ${B ** 3 - 1}, … (one less than ${B}, ${B * B}, ${B ** 3}, …)`;

const COMMON_BOTTOM = "Write the gradient and the y-intercept as fractions in lowest terms (a whole number 4 is 4/1). Their common bottom is the smallest number both bottom numbers divide into (5/6 and 3/4: 12; 2/3 and 5: 3).";
const shape: Shape<RepeatingParams> = {
  main: {
    ...more<RepeatingParams>("target", "the power of the target nearest the common bottom, bigger better", "", "si"),
    sentence: p => `${COMMON_BOTTOM} The targets are ${targetList(p.B)}. Find the target nearest the common bottom (halfway between two goes to the bigger). Score: its power, how many ${p.B}s multiply to make the target plus 1 (${p.B ** 3 - 1} + 1 = ${p.B} × ${p.B} × ${p.B}: 3); bigger is better.`,
  },
  tieBreakers: [
    distance<RepeatingParams>("near", "the common bottom close to its target",
      "Then: how far the common bottom is from that target; smaller is better.", "si"),
    distance<RepeatingParams>("x-whole", "the x-intercept times the target close to a whole number",
      "Then: multiply the x-intercept (where the line crosses the x-axis) by the target; how far is that from the nearest whole number? Smaller is better (a flat line has no x-intercept and counts as worst).", "si"),
    distance<RepeatingParams>("top-repunit", "the gradient's top close to the target's ones-number",
      "Then: divide the target by one less than the base to get the number written with only 1s in that base (in base 3, 26 ÷ 2 = 13, written 111; in base 2 the target itself: 15 ÷ 1 = 15). How far is the gradient's top number (ignoring its sign) from it? Smaller is better.", "si"),
    more<RepeatingParams>("remainder", "the y-intercept's whole part leaves a big remainder when divided by the power",
      "Then: divide the y-intercept's whole part (the whole number at or below it, ignoring its sign) by the power: the remainder should be as big as possible.", "si"),
  ],
};

/** Witnesses for the ladder's tail cap (value.ts ladderCaps): lines whose common bottom is the n-th target itself. */
export const repeatingWitness = (p: RepeatingParams, n: number): LineState[] => {
  const T = BigInt(p.B) ** BigInt(n) - 1n;
  return T < 2n ? [] : [q(1, T), q(-1, T)].flatMap(m => [{ lines: [fromMC(m, q(0))] }, { lines: [fromMC(m, q(1, T))] }]);
};

export const repeatingBottom = ladder(family<RepeatingParams>("repeating-bottom", "Repeating Bottom", ["si"], shape,
  onRationals(REPEATING_BASES.map(B => ({ B }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient
    const c = num(ctx.read(cRef))!;
    const L = m.d / gcd(m.d, c.d) * c.d;
    const { T, n } = nearestRepeatTarget(L, BigInt(p.B));
    ctx.term("target", `common bottom ${L}: nearest target ${T} = ${p.B}^${n} − 1`, q(n), [mRef, cRef]);
    ctx.term("near", `${L} is ${abs(L - T)} from ${T}`, q(abs(L - T)), [mRef, cRef]);
    if (m.n === 0n) ctx.term("x-whole", "a flat line has no x-intercept", { undefined: "a flat line has no x-intercept" }, [mRef, cRef]);
    else {
      const X = Qn.neg(Qn.div(c, m)), d = distanceToWhole(Qn.mul(X, q(T)));
      ctx.term("x-whole", `x-intercept ${Qn.toWire(X)} × ${T} is ${Qn.toWire(d)} from a whole number`, d, [mRef, cRef]);
    }
    const R = T / BigInt(p.B - 1);
    ctx.term("top-repunit", `the gradient's top ${abs(m.n)} against ${R}`, q(abs(abs(m.n) - R)), [mRef]);
    const w = abs(Qn.floor(c));
    ctx.term("remainder", `${w} divided by ${n} leaves ${w % BigInt(n)}`, q(w % BigInt(n)), [cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
  }), repeatingWitness);
