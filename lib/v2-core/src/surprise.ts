// The cost of a turn, in bits (owner decisions of 17 November). Energy IS bits: no conversion factor.
//
// A turn pins one lens (a list of whole numbers) and makes a list of mutations on those numbers. It costs
//   - the naming bits of each mutation: which mutation (log2 of the menu), which number (log2 of the lens's count),
//     its argument (a self-delimiting whole-number code, plus a sign bit where relevant), and one "continue" bit;
//   - plus the turn's surprise: for each whole number of the lens, (s + g)² / (2 ln 2), with s = H(after) − H(before)
//     its rise in information size and g = λ·ln 2 / 2 the drift of a passive jiggle one bit wide whose resting law is
//     ∝ 2^(−λH). Rises cost more than equal falls by λ·|s|; an unchanged number pays g² / (2 ln 2) (holding).

/** The one dial: gravity. */
export const LAMBDA = 1;
/** The passive downward drift per turn, in bits. */
export const GRAVITY = (LAMBDA * Math.LN2) / 2;

/** log2 of a non-negative bigint or number, exact enough for pricing at any size. */
function log2Abs(n: bigint | number): number {
  if (typeof n === "number") return Math.log2(Math.abs(n));
  const a = n < 0n ? -n : n;
  if (a === 0n) return -Infinity;
  const bits = a.toString(2).length;
  if (bits <= 52) return Math.log2(Number(a));
  return Math.log2(Number(a >> BigInt(bits - 52))) + (bits - 52);
}

/** Information size of a whole number: H(n) = log2(1 + |n|). */
export function infoSize(n: bigint | number): number {
  if (typeof n === "bigint") return log2Abs((n < 0n ? -n : n) + 1n);
  return Math.log2(1 + Math.abs(n));
}

/** Elias gamma code length of a positive whole number k ≥ 1: 2⌊log2 k⌋ + 1. */
export function eliasBits(k: bigint | number): number {
  const big = typeof k === "bigint" ? k : BigInt(Math.round(k));
  if (big < 1n) throw new Error(`eliasBits: ${k} is not a positive whole number`);
  return 2 * (big.toString(2).length - 1) + 1;
}

/** Bits of a whole-number argument k (k = 0 allowed), plus a sign bit when the argument can be negative. */
export function argBits(k: bigint | number, signed: boolean): number {
  const big = typeof k === "bigint" ? k : BigInt(Math.round(k));
  const mag = big < 0n ? -big : big;
  return eliasBits(mag + 1n) + (signed ? 1 : 0);
}

/** Naming bits of one mutation: which mutation, which number, its argument, and the continue bit. */
export function namingBits(m: { menuSize: number; lensSize: number; argBits: number }): number {
  return Math.log2(m.menuSize) + Math.log2(m.lensSize) + m.argBits + 1;
}

/**
 * Surprise of a turn's overall change, in bits. `crossed[i]` marks a number that an additive change carried through
 * zero: its path runs down to zero and up again, so the square uses that path's length (the drift term keeps the net
 * rise, so the cost stays the surprise of a reversible jiggle and is never negative).
 */
export function turnSurprise(before: readonly (bigint | number)[], after: readonly (bigint | number)[], crossed?: readonly boolean[]): number {
  if (before.length !== after.length) throw new Error("turnSurprise: lens lengths differ");
  let total = 0;
  for (let i = 0; i < before.length; i++) {
    const hb = infoSize(before[i]), ha = infoSize(after[i]);
    const s = ha - hb;
    const path = crossed?.[i] ? hb + ha : Math.abs(s);
    total += (path * path + 2 * GRAVITY * s + GRAVITY * GRAVITY) / (2 * Math.LN2);
  }
  return total;
}

export type TurnPrice = { naming: number; surprise: number; total: number };

/** The whole price of a turn: its mutations' naming bits plus its surprise. */
export function turnCost(namings: readonly number[], before: readonly (bigint | number)[], after: readonly (bigint | number)[], crossed?: readonly boolean[]): TurnPrice {
  const naming = namings.reduce((a, b) => a + b, 0);
  const surprise = turnSurprise(before, after, crossed);
  return { naming, surprise, total: naming + surprise };
}
