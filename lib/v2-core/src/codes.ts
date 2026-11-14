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

// ---------------------------------------------------------------- mixed costing (owner decision 17)
//
// "Use mixed costing now." Additive moves are priced by steps: the cost of adding k grows in proportion to |k|
// ("Adding to a number should have cost proportional to the absolute value of the amount added"). Multiplicative
// moves are priced by digits (the gamma codes above): the cost of a factor grows with its length. The number code that
// prices reads and confines the walk follows the same principle: a whole number is written by its prime factorisation,
// each prime p costing STEP·p bits, so large primes are dear and large smooth composites cheap, and a number's energy
// is roughly its shortest arithmetic description.

/** Bits per unit of an amount added, and per unit of a prime in a factorisation. */
export const STEP = 0.5;
const R = 2 ** -STEP;
/** −log2(1 − 2^−STEP): the constant that makes a geometric code complete. */
const GEO = -Math.log2(1 - R);

/** A geometric draw j ≥ 0 with P(j) = (1 − r) r^j, r = 2^−STEP. */
function geometric(rng: Rng): number {
  const u = rng.unit();
  return Math.floor(Math.log1p(-u) / Math.log(R));
}

/** A nonzero integer by steps: a sign bit, then |n| − 1 geometric: 1 + STEP·(|n| − 1) + GEO bits. */
export function stepsNonzeroBits(n: bigint): number {
  if (n === 0n) throw new RangeError("steps code: 0");
  const m = n < 0n ? -n : n;
  return 1 + STEP * Number(m - 1n) + GEO;
}
export function sampleStepsNonzero(rng: Rng): bigint {
  const s = rng.bit();
  const m = BigInt(1 + geometric(rng));
  return s ? -m : m;
}

/** Any integer by steps: 0 → 1 bit; otherwise 1 + the nonzero code. */
export const stepsIntBits = (n: bigint): number => (n === 0n ? 1 : 1 + stepsNonzeroBits(n));
export function sampleStepsInt(rng: Rng): bigint {
  return rng.bit() === 0 ? 0n : sampleStepsNonzero(rng);
}

/** A nonzero rational p/q by steps on its numerator and denominator: 1 + STEP·(|p| − 1) + STEP·(q − 1) + 2·GEO bits. */
export function stepsNonzeroRatBits(x: Q): number {
  return stepsNonzeroBits(x.n) + STEP * Number(x.d - 1n) + GEO;
}
export function sampleStepsNonzeroRat(rng: Rng): Q | null {
  const p = sampleStepsNonzero(rng);
  const d = BigInt(1 + geometric(rng));
  return gcd(p, d) === 1n ? q(p, d) : null;
}
export const stepsRatBits = (x: Q): number => (x.n === 0n ? 1 : 1 + stepsNonzeroRatBits(x));
export function sampleStepsRat(rng: Rng): Q | null {
  return rng.bit() === 0 ? q(0) : sampleStepsNonzeroRat(rng);
}

/** Trial division stops here; a cofactor with no factor below it is treated as one prime (dear, and rare). */
const FACTOR_LIMIT = 100_000n;

function smallPrimes(limit: number): number[] {
  const sieve = new Uint8Array(limit + 1);
  const out: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
  }
  return out;
}
/** log2 of Π_p 1/(1 − 2^−STEP·p): the normaliser of the factorisation code (the tail past 10^4 is below 2^−5000). */
const LOG2_Z = smallPrimes(10_000).reduce((a, p) => a - Math.log2(1 - 2 ** (-STEP * p)), 0);

/** The weight of n ≥ 1: STEP · Σ e·p over its factorisation p^e (1 → 0). */
export function factorWeight(n: bigint): number {
  let m = n < 0n ? -n : n;
  if (m < 1n) throw new RangeError("factorWeight needs n ≥ 1");
  let w = 0;
  for (let d = 2n; d * d <= m && d <= FACTOR_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { w += Number(d); m /= d; }
  if (m > 1n) w += Number(m);
  return STEP * w;
}

/** A positive integer by its factorisation: factorWeight(n) + log2 Z. Kraft sum exactly 1 over n ≥ 1. */
export const mixedPosBits = (n: bigint): number => factorWeight(n) + LOG2_Z;
/** Any integer: 0 → 1 bit; ±n → 2 + mixedPosBits(|n|) (one bit for "not zero", one for the sign). */
export const mixedIntBits = (n: bigint): number => (n === 0n ? 1 : 2 + mixedPosBits(n < 0n ? -n : n));
