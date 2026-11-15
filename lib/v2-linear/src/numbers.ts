/** Number facts rules use: primes near a rational. Exact, on bigint. */
import { Qn, q, type Q } from "@workspace/v2-core";

/** Numbers up to this are trial-divided in floating point (exact below 2^53), the same divisors in the same order. */
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const LIMIT = 100_000;

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  if (n <= SAFE) {
    const x = Number(n);
    for (let d = 5; d * d <= x && d <= LIMIT; d += 6) if (x % d === 0 || x % (d + 2) === 0) return false;
    return true;
  }
  for (let d = 5n; d * d <= n && d <= TRIAL_DIVISION_LIMIT; d += 6n) if (n % d === 0n || n % (d + 2n) === 0n) return false;
  return true;
}

/** The largest prime ≤ x, or null when x < 2. */
export function primeAtMost(x: Q): bigint | null {
  for (let n = Qn.floor(x); n >= 2n; n--) if (isPrime(n)) return n;
  return null;
}

/** The smallest prime ≥ x. */
export function primeAtLeast(x: Q): bigint {
  let n = Qn.ceil(x);
  if (n < 2n) n = 2n;
  while (!isPrime(n)) n++;
  return n;
}

/** The primes either side of x (one when x is prime or below 2), nearest first. */
export function nearbyPrimes(x: Q): bigint[] {
  const lo = primeAtMost(x), hi = primeAtLeast(x);
  const ps = lo === null || lo === hi ? [hi] : [lo, hi];
  return ps.sort((a, b) => Qn.cmp(Qn.abs(Qn.sub(x, q(a))), Qn.abs(Qn.sub(x, q(b)))));
}

/** ⌊√n⌋ for n ≥ 0 (Newton's method on bigint: exact at any size). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** The whole number nearest x (halves round up). */
export const nearestInteger = (x: Q): bigint => Qn.floor(Qn.add(x, q(1, 2)));

/** The root r ≥ 0 of the perfect square r² nearest x (ties go to the smaller square; negative x → 0). */
export function nearestSquareRoot(x: Q): bigint {
  if (x.n <= 0n) return 0n;
  const r = isqrt(Qn.floor(x));
  const lo = Qn.sub(x, q(r * r)), hi = Qn.sub(q((r + 1n) * (r + 1n)), x);
  return Qn.cmp(hi, lo) < 0 ? r + 1n : r;
}

/**
 * Trial division stops at this divisor: a number with no factor below it counts as prime here. Rule scores stay exact
 * and deterministic, and the cost of a rule evaluation stays bounded on huge numbers (which the confining code makes
 * vanishingly rare).
 */
export const TRIAL_DIVISION_LIMIT = BigInt(LIMIT);

/** The smallest prime factor of |n| (up to TRIAL_DIVISION_LIMIT, else |n|); 1 for 0 and ±1. */
export function smallestPrimeFactor(n: bigint): bigint {
  const m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  if (m % 2n === 0n) return 2n;
  if (m <= SAFE) {
    const x = Number(m);
    for (let d = 3; d * d <= x && d <= LIMIT; d += 2) if (x % d === 0) return BigInt(d);
    return m;
  }
  for (let d = 3n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += 2n) if (m % d === 0n) return d;
  return m;
}

/** The largest prime factor of |n| (a cofactor with no factor below the limit counts as prime); 1 for 0 and ±1. */
export function largestPrimeFactor(n: bigint): bigint {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  let big = 1n;
  if (m <= SAFE) {
    let x = Number(m), b = 1;
    for (let d = 2; d * d <= x && d <= LIMIT; d += d === 2 ? 1 : 2) while (x % d === 0) { b = d; x /= d; }
    return x > 1 ? BigInt(x) : BigInt(b);
  }
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { big = d; m /= d; }
  return m > 1n ? m : big;
}

/** Ω(n): prime factors of |n| counted with multiplicity (a cofactor with no factor below the limit counts once); 0 for 0 and ±1. */
export function primeFactorCount(n: bigint): number {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 0;
  let k = 0;
  if (m <= SAFE) {
    let x = Number(m);
    for (let d = 2; d * d <= x && d <= LIMIT; d += d === 2 ? 1 : 2) while (x % d === 0) { x /= d; k++; }
    return x > 1 ? k + 1 : k;
  }
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { m /= d; k++; }
  return m > 1n ? k + 1 : k;
}

/** Distance from x to the nearest prime (primes are positive, so anything at or below 2 is measured to 2). */
export function distanceToPrime(x: Q): Q {
  return Qn.abs(Qn.sub(x, q(nearbyPrimes(x)[0]!)));
}

/**
 * The dealt prime filter (owner decision 41: "distance to nearest prime ending in k (base 10) ... rather than just
 * distance to nearest prime"): primes whose last decimal digit is k, k ∈ 1, 3, 7, 9 (every prime but 2 and 5 ends in
 * one of them, a quarter each).
 */
export const PRIME_ENDINGS = [1, 3, 7, 9] as const;
export type PrimeEnding = (typeof PRIME_ENDINGS)[number];
const endsIn = (p: bigint, k: number) => p % 10n === BigInt(k);
/** The prime ending in k nearest x (on a tie, the smaller): searched outward from x. */
export function nearestPrimeEnding(x: Q, k: number): bigint {
  const f = Qn.floor(x);
  let lo: bigint | null = null;
  for (let n = f; n >= 2n; n--) if (endsIn(n, k) && isPrime(n)) { lo = n; break; }
  let hi = f + 1n < 2n ? 2n : f + 1n;
  while (!(endsIn(hi, k) && isPrime(hi))) hi++;
  if (lo === null) return hi;
  return Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0 ? lo : hi;
}
/** Distance from x to the nearest prime ending in k. */
export const distanceToPrimeEnding = (x: Q, k: number): Q => Qn.abs(Qn.sub(x, q(nearestPrimeEnding(x, k))));
/** Whether n is a prime ending in k. */
export const isPrimeEnding = (n: bigint, k: number): boolean => endsIn(n, k) && isPrime(n);

/** Distance from x to the nearest whole number. */
export const distanceToWhole = (x: Q): Q => Qn.abs(Qn.sub(x, q(nearestInteger(x))));
