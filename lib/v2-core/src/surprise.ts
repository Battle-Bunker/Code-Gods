// The cost of a turn, in bits (owner decisions of 17 November). Energy IS bits: no conversion factor.
//
// A turn pins one lens (a list of whole numbers) and makes a list of mutations on those numbers. It costs
//   - the naming bits of each mutation: which mutation (log2 of the menu), which number (log2 of the lens's count),
//     its argument (a self-delimiting whole-number code, plus a sign bit where relevant), and one "continue" bit;
//   - plus the turn's surprise: for each whole number of the lens, s² / (2 ln 2) + (λ/2)·s, with s = H(after) − H(before)
//     its change in information size; the turn's total never goes below zero (owner, 17 Nov: gravity λ is the uphill toll).

/** The passive downward drift per turn, in bits, at gravity λ (the game's physics setting `gravity`). */
export const driftOf = (lambda: number): number => (lambda * Math.LN2) / 2;

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

/** Rissanen's normalising constant for the universal code of the positive integers. */
export const RISSANEN_C = 2.865064;

/**
 * Rissanen's universal code length of a positive whole number n ≥ 1, as a real bit count:
 * L*(n) = log2 c + log2 n + log2 log2 n + … (positive terms only). Parameter-free, and it grows like log2 n (gamma
 * doubled the bit length).
 */
export function universalBits(n: bigint | number): number {
  const big = typeof n === "bigint" ? n : BigInt(Math.round(n));
  if (big < 1n) throw new Error(`universalBits: ${n} is not a positive whole number`);
  let bits = Math.log2(RISSANEN_C);
  let x = log2Abs(big);
  while (x > 0) { bits += x; x = Math.log2(x); }
  return bits;
}

/** Bits of a whole-number argument k (k = 0 allowed), plus a sign bit when the argument can be negative. */
export function argBits(k: bigint | number, signed: boolean): number {
  const big = typeof k === "bigint" ? k : BigInt(Math.round(k));
  const mag = big < 0n ? -big : big;
  return universalBits(mag + 1n) + (signed ? 1 : 0);
}

/** Naming bits of one mutation: which mutation, which number, its argument, and the continue bit. */
export function namingBits(m: { menuSize: number; lensSize: number; argBits: number }): number {
  return Math.log2(m.menuSize) + Math.log2(m.lensSize) + m.argBits + 1;
}

/**
 * One number's part of a turn's surprise, in bits (unfloored: a fall is negative): path² / (2 ln 2) + (λ/2)·s, with s the
 * net change in size (bits; negative going down) and path |s|, or, for a number an additive change carried through zero,
 * the length of its path down to zero and up again (hb + ha). Gravity λ is the uphill toll: a rise of s bits costs λ·s/2
 * more than its stride, a fall λ·s/2 less (owner, 17 Nov: "make big numbers genuinely expensive to reach").
 */
export function numberSurprise(lambda: number, before: bigint | number, after: bigint | number, crossed = false): number {
  const hb = infoSize(before), ha = infoSize(after), s = ha - hb, path = crossed ? hb + ha : Math.abs(s);
  return (path * path) / (2 * Math.LN2) + (lambda / 2) * s;
}

/**
 * Surprise of a turn's overall change, in bits: the sum of its numbers' parts (numberSurprise), and never below zero (a
 * turn never costs less than its naming bits: going down can cancel its own stride but never pays out). An unchanged
 * number costs nothing. `crossed[i]` marks a number an additive change carried through zero.
 */
export function turnSurprise(lambda: number, before: readonly (bigint | number)[], after: readonly (bigint | number)[], crossed?: readonly boolean[]): number {
  if (before.length !== after.length) throw new Error("turnSurprise: lens lengths differ");
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error("turnSurprise: gravity must be a finite number ≥ 0");
  let total = 0;
  for (let i = 0; i < before.length; i++) total += numberSurprise(lambda, before[i]!, after[i]!, crossed?.[i] ?? false);
  return Math.max(0, total);
}

export type TurnPrice = { naming: number; surprise: number; total: number };

/** The whole price of a turn: its mutations' naming bits plus its surprise. */
export function turnCost(lambda: number, namings: readonly number[], before: readonly (bigint | number)[], after: readonly (bigint | number)[], crossed?: readonly boolean[]): TurnPrice {
  const naming = namings.reduce((a, b) => a + b, 0);
  const surprise = turnSurprise(lambda, before, after, crossed);
  return { naming, surprise, total: naming + surprise };
}
