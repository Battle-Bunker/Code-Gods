import { test } from "node:test";
import assert from "node:assert/strict";
import { gammaBits, intBits, nonzeroBits, ratBits, nonzeroRatBits, sampleGamma, sampleInt, sampleNonzero, sampleRat, sampleNonzeroRat } from "../src/codes.ts";
import { rng } from "../src/rng.ts";
import { q, toWire, type Q } from "../src/q.ts";

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
