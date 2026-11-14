/** Number facts rules use: primes near a rational. Exact, on bigint. */
import { Qn, q, type Q } from "@workspace/v2-core";

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
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
export const TRIAL_DIVISION_LIMIT = 100_000n;

/** The smallest prime factor of |n| (up to TRIAL_DIVISION_LIMIT, else |n|); 1 for 0 and ±1. */
export function smallestPrimeFactor(n: bigint): bigint {
  const m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  if (m % 2n === 0n) return 2n;
  for (let d = 3n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += 2n) if (m % d === 0n) return d;
  return m;
}

/** The largest prime factor of |n| (a cofactor with no factor below the limit counts as prime); 1 for 0 and ±1. */
export function largestPrimeFactor(n: bigint): bigint {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  let big = 1n;
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { big = d; m /= d; }
  return m > 1n ? m : big;
}

/** Every prime p with lo ≤ p ≤ hi: a prime-size ladder with one rung per prime (the curator's delta, #385). */
export function primesBetween(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(2, lo); n <= hi; n++) if (isPrime(BigInt(n))) out.push(n);
  return out;
}

/** Ω(n): prime factors of |n| counted with multiplicity (a cofactor with no factor below the limit counts once); 0 for 0 and ±1. */
export function primeFactorCount(n: bigint): number {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 0;
  let k = 0;
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { m /= d; k++; }
  return m > 1n ? k + 1 : k;
}

/** Distance from x to the nearest prime (primes are positive, so anything at or below 2 is measured to 2). */
export function distanceToPrime(x: Q): Q {
  return Qn.abs(Qn.sub(x, q(nearbyPrimes(x)[0]!)));
}

/** Distance from x to the nearest whole number. */
export const distanceToWhole = (x: Q): Q => Qn.abs(Qn.sub(x, q(nearestInteger(x))));
