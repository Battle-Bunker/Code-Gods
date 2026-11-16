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

test("prime suffixes (owner, 16 Nov): any 1 to 3 digits ending in 1, 3, 7 or 9; read as written digits, so leading zeros count", async () => {
  const { isSuffix, isPrimeWithSuffix, nearestPrimeWithSuffix, primesWithSuffix, drawSuffix } = await import("../src/numbers.ts");
  const { q } = await import("@workspace/v2-core");
  for (const s of ["1", "3", "07", "13", "007", "999"]) assert.equal(isSuffix(s), true, s);
  for (const s of ["", "2", "5", "10", "1234", "a1", "-7", 7]) assert.equal(isSuffix(s), false, String(s));
  assert.deepEqual(primesWithSuffix("13", 4), [13n, 113n, 313n, 613n]);
  assert.deepEqual(primesWithSuffix("007", 3), [4007n, 6007n, 9007n]);   // 7 is not written "…007"; 1007 = 19·53, 2007 = 9·223, 3007 = 31·97
  assert.deepEqual(primesWithSuffix("7", 3), [7n, 17n, 37n]);
  assert.equal(isPrimeWithSuffix(113n, "13"), true);
  assert.equal(isPrimeWithSuffix(13n, "113"), false);
  assert.equal(isPrimeWithSuffix(7n, "007"), false);
  assert.equal(nearestPrimeWithSuffix(q(200), "13"), 113n);    // 113 is 87 below, 313 is 113 above
  assert.equal(nearestPrimeWithSuffix(q(214), "13"), 313n);
  assert.equal(nearestPrimeWithSuffix(q(213), "13"), 113n);    // a tie goes to the smaller
  assert.equal(nearestPrimeWithSuffix(q(0), "007"), 4007n);
  assert.equal(nearestPrimeWithSuffix(q(5000), "007"), 4007n);
  const { rng: makeRng } = await import("@workspace/v2-core");
  const rng = makeRng("suffix-test"), seen = new Set<string>();
  for (let i = 0; i < 2000; i++) { const s = drawSuffix(rng); assert.equal(isSuffix(s), true, s); seen.add(s); }
  assert.ok(seen.size > 200, `a large space: ${seen.size} distinct suffixes in 2,000 draws`);
});
