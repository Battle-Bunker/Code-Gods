/**
 * The codes left after the turn law (17 Nov; surprise.ts names a move's numbers with Rissanen's universal code): the
 * Elias gamma integer code that prices program text (summon and edit prices, lib/v2-agents summon.ts), and the bits of
 * a uniform choice. The old pricing codes (amounts, factors, mixed and steps codes) are deleted.
 */

/** Elias gamma length of a positive whole number: 2⌊log2 n⌋ + 1. */
export function gammaBits(n: bigint): number {
  if (n < 1n) throw new RangeError(`gammaBits: ${n} is not positive`);
  return 2 * (n.toString(2).length - 1) + 1;
}
const zigzag = (n: bigint): bigint => (n >= 0n ? 2n * n : -2n * n - 1n);
/** A signed whole number by gamma on its zigzag position (0, −1, 1, −2, …). */
export function intBits(n: bigint): number {
  return gammaBits(zigzag(n) + 1n);
}

/** The bits of a uniform choice among k. */
export const choiceBits = (k: number): number => Math.log2(k);
