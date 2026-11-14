/**
 * The integers a whole-number line's coefficients range over, cheapest first (analytic calibration study,
 * docs/engine-v2/analytic-calibration.md §3). On `line-z` the walk's stationary law is π(m, c) = p(m)·p(c),
 * p(n) = 2^−mixedInt(n), so a value function's exact sums (value.ts) enumerate m and c from this list.
 */
import { mixedIntBits } from "@workspace/v2-core";

/** Every integer n with mixedInt(n) ≤ budget, with its bits: by prime factorisation, cheapest primes first. */
export function integersWithin(budget: number): { n: bigint; bits: number }[] {
  const primes: number[] = [];
  for (let k = 2; primes.length === 0 || primes[primes.length - 1]! < 2 * budget; k++) if (primes.every(p => k % p)) primes.push(k);
  const out: { n: bigint; bits: number }[] = mixedIntBits(0n) <= budget ? [{ n: 0n, bits: mixedIntBits(0n) }] : [];
  const rec = (i: number, n: bigint, sum: number): void => {
    if (n > 1n || i === 0 && n === 1n) {
      const b = mixedIntBits(n);
      if (b <= budget) { out.push({ n, bits: b }, { n: -n, bits: b }); }
    }
    for (let j = i; j < primes.length; j++) {
      const p = primes[j]!;
      // mixedPos grows by p/2 per factor p: stop once even the cheapest addition is over budget.
      if (mixedIntBits(1n) + (sum + p) / 2 > budget + 1e-9) break;
      rec(j, n * BigInt(p), sum + p);
    }
  };
  rec(0, 1n, 0);
  return out.sort((a, b) => a.bits - b.bits);
}
