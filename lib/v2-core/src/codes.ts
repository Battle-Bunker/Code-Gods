/**
 * Prefix codes (spec §2.3). Each length function is the code length in bits; each sampler draws a value with
 * probability exactly 2^−length (or returns null for the code's unused mass), which is what the walk needs.
 */
import { gcd, type Q, q } from "./q.ts";
import type { Rng } from "./rng.ts";

/** ⌊log2 n⌋ for n ≥ 1. */
export function floorLog2(n: bigint): number {
  if (n < 1n) throw new RangeError("floorLog2 needs n ≥ 1");
  return n.toString(2).length - 1;
}

/** Elias gamma: n ≥ 1, 2⌊log2 n⌋ + 1 bits. */
export function gammaBits(n: bigint): number {
  return 2 * floorLog2(n) + 1;
}
export function sampleGamma(rng: Rng): bigint {
  let l = 0;
  while (rng.bit() === 0) l++;
  let v = 1n;
  for (let i = 0; i < l; i++) v = (v << 1n) | BigInt(rng.bit());
  return v;
}

const zigzag = (n: bigint): bigint => (n >= 0n ? 2n * n : -2n * n - 1n);
const unzigzag = (z: bigint): bigint => (z % 2n === 0n ? z / 2n : -(z + 1n) / 2n);

/** Any integer: gamma(zigzag(n) + 1). 0 → 1 bit, ±1 → 3, ±2 and ±3 → 5. */
export function intBits(n: bigint): number {
  return gammaBits(zigzag(n) + 1n);
}
export function sampleInt(rng: Rng): bigint {
  return unzigzag(sampleGamma(rng) - 1n);
}

/** A nonzero integer: a sign bit and gamma(|n|). ±1 → 2 bits, ±2 and ±3 → 4. */
export function nonzeroBits(n: bigint): number {
  if (n === 0n) throw new RangeError("nonzero code: 0");
  return 1 + gammaBits(n < 0n ? -n : n);
}
export function sampleNonzero(rng: Rng): bigint {
  const s = rng.bit();
  const m = sampleGamma(rng);
  return s ? -m : m;
}

/** A rational in lowest terms: int(p) + gamma(q). */
export function ratBits(x: Q): number {
  return intBits(x.n) + gammaBits(x.d);
}
export function sampleRat(rng: Rng): Q | null {
  const p = sampleInt(rng), d = sampleGamma(rng);
  return gcd(p, d) === 1n ? q(p, d) : null;
}

/** A nonzero rational in lowest terms: nonzero(p) + gamma(q). */
export function nonzeroRatBits(x: Q): number {
  return nonzeroBits(x.n) + gammaBits(x.d);
}
export function sampleNonzeroRat(rng: Rng): Q | null {
  const p = sampleNonzero(rng), d = sampleGamma(rng);
  return gcd(p, d) === 1n ? q(p, d) : null;
}

/** One of k equally likely choices. */
export const choiceBits = (k: number): number => Math.log2(k);
