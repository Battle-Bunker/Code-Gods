/** Number facts rules use: primes near a rational. Exact, on bigint. */
import { Qn, q, type Q } from "@workspace/v2-core";

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  for (let d = 5n; d * d <= n; d += 6n) if (n % d === 0n || n % (d + 2n) === 0n) return false;
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
