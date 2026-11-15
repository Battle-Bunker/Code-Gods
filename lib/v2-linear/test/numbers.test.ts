import { test } from "node:test";
import assert from "node:assert/strict";

test("isPrime is exact above 10^10 (Miller–Rabin, as the agents' helper): composites with no small factor are not prime", async () => {
  const { isPrime } = await import("../src/numbers.ts");
  assert.equal(isPrime(100003n * 100019n), false);              // 10,002,200,057: both factors above 10^5
  assert.equal(isPrime(1000003n * 1000033n), false);
  assert.equal(isPrime(10000000019n), true);
  assert.equal(isPrime(1000000000000000003n), true);
  assert.equal(isPrime(3215031751n), false);                     // a strong pseudoprime to 2, 3, 5 and 7
  for (const p of [2n, 3n, 5n, 41n, 1681n, 1999n, 9999999967n]) assert.equal(isPrime(p), p !== 1681n, String(p));   // 1681 = 41²
});
