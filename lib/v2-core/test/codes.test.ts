import { test } from "node:test";
import assert from "node:assert/strict";
import { gammaBits, intBits, nonzeroBits, ratBits, nonzeroRatBits, sampleGamma, sampleInt, sampleNonzero, sampleRat, sampleNonzeroRat } from "../src/codes.ts";
import { rng } from "../src/rng.ts";
import { gcd, q, toWire, type Q } from "../src/q.ts";
import { amountCode, amountSize, factorCode, factorSize, sampleAmount, sampleDisplacement, sampleFactor } from "../src/codes.ts";

test("code lengths match the specification's table (§2.3)", () => {
  assert.deepEqual([1n, 2n, 3n, 4n, 7n, 8n].map(gammaBits), [1, 3, 3, 5, 5, 7]);
  assert.deepEqual([0n, 1n, -1n, 2n, -2n, 3n, -3n, 4n].map(intBits), [1, 3, 3, 5, 5, 5, 5, 7]);
  assert.deepEqual([1n, -1n, 2n, -3n, 4n, -7n].map(nonzeroBits), [2, 2, 4, 4, 6, 6]);
  assert.equal(ratBits(q(-1, 2)), 3 + 3);
  assert.equal(nonzeroRatBits(q(3, 4)), 4 + 5);
});

test("integer codes are symmetric in sign", () => {
  for (let n = 1n; n < 200n; n++) assert.equal(intBits(n), intBits(-n));
});

/** Over many draws, the commonest values' frequencies are 2^−bits within four standard errors. */
function agrees<T>(draw: () => T | null, key: (t: T) => string, bits: (t: T) => number, n = 200_000): void {
  const counts = new Map<string, { t: T; c: number }>();
  for (let i = 0; i < n; i++) {
    const t = draw();
    if (t === null) continue;
    const k = key(t);
    const e = counts.get(k);
    if (e) e.c++; else counts.set(k, { t, c: 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.c - a.c).slice(0, 20);
  for (const { t, c } of top) {
    const p = 2 ** -bits(t);
    const se = Math.sqrt(p * (1 - p) / n);
    assert.ok(Math.abs(c / n - p) < 4 * se + 1e-9, `${key(t)}: ${c / n} against ${p}`);
  }
}

test("samplers draw each value with probability 2^−bits", () => {
  const r = rng("codes-test");
  agrees(() => sampleGamma(r), String, gammaBits);
  agrees(() => sampleInt(r), String, intBits);
  agrees(() => sampleNonzero(r), String, nonzeroBits);
  agrees<Q>(() => sampleRat(r), toWire, ratBits);
  agrees<Q>(() => sampleNonzeroRat(r), toWire, nonzeroRatBits);
});

// ---------------------------------------------------------------- far moves are dear

test("size codes: a whole fee in proportion to the size, and a complete (sub-)probability", () => {
  for (const o of [Math.log2(9), Math.log2(9) + 2, Math.log2(9) + Math.log2(3), Math.log2(9) + 4]) {
    for (const rational of [false, true]) {
      const c = amountCode(o, 1, rational);
      // The fee of size n is n times the fee of size 1, each paying o: rate·n = n·(o + bits(1)).
      for (const n of [1, 2, 7, 29]) assert.ok(Math.abs(o + c.bits(n) - n * (o + c.bits(1))) < 1e-9);
      // Kraft: Σ 2^−bits over every nonzero amount in lowest terms ≤ 1 (= 1 over Z).
      let sum = 0;
      for (let d = 1n; d <= (rational ? 300n : 1n); d++) for (let p = 1n; p <= 300n; p++) if (gcd(p, d) === 1n) sum += 2 * 2 ** -c.bits(amountSize(q(p, d)));
      assert.ok(sum <= 1 + 1e-9 && sum > (rational ? 0.5 : 1 - 1e-9), `amount o=${o} ${rational}: ${sum}`);
      const c2 = amountCode(o, 2, rational);
      let sum2 = 0;
      const comps: Q[] = [q(0)];
      for (let d = 1n; d <= (rational ? 60n : 1n); d++) for (let p = 1n; p <= 60n; p++) if (gcd(p, d) === 1n) comps.push(q(p, d), q(-p, d));
      for (const u of comps) for (const v of comps) if (u.n !== 0n || v.n !== 0n) sum2 += 2 ** -c2.bits(amountSize(u) + amountSize(v));
      assert.ok(sum2 <= 1 + 1e-9 && sum2 > (rational ? 0.4 : 1 - 1e-6), `displacement o=${o} ${rational}: ${sum2}`);
    }
    const f = factorCode(o);
    let sumF = 0;
    for (let d = 1n; d <= 400n; d++) for (let p = 1n; p <= 400n; p++) if (gcd(p, d) === 1n && !(p === 1n && d === 1n)) sumF += 2 * 2 ** -f.bits(factorSize(q(p, d)));
    assert.ok(sumF <= 1 + 1e-9 && sumF > 0.5, `factor o=${o}: ${sumF}`);
    // A factor costs what its prime factors cost one by one.
    assert.ok(Math.abs(o + f.bits(factorSize(q(-30, 7))) - [2, 3, 5, 7].reduce((t, p) => t + o + f.bits(factorSize(q(p))), 0)) < 1e-9);
  }
  assert.deepEqual([q(5), q(-5), q(1, 2), q(-7, 3), q(0)].map(amountSize), [5, 5, 2, 9, 0]);
});

test("size samplers draw each value with probability 2^−bits", () => {
  const r = rng("size-codes-test");
  const o = Math.log2(9);
  for (const rational of [false, true]) {
    const c = amountCode(o, 1, rational), c2 = amountCode(o, 2, rational);
    agrees<Q>(() => sampleAmount(r, o, rational), toWire, x => c.bits(amountSize(x)));
    agrees<[Q, Q]>(() => sampleDisplacement(r, o, rational), ([u, v]) => `${toWire(u)},${toWire(v)}`, ([u, v]) => c2.bits(amountSize(u) + amountSize(v)));
  }
  const f = factorCode(o);
  agrees<Q>(() => sampleFactor(r, o), toWire, x => f.bits(factorSize(x)));
});
