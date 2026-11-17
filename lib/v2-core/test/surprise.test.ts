import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAVITY, argBits, eliasBits, infoSize, namingBits, turnCost, turnSurprise } from "../src/surprise.ts";

test("information size and codes", () => {
  assert.equal(infoSize(0), 0);
  assert.equal(infoSize(1), 1);
  assert.equal(infoSize(-3), 2);
  assert.ok(Math.abs(infoSize(10n ** 30n) - 30 * Math.log2(10)) < 1e-9);
  assert.deepEqual([1, 2, 3, 4, 7, 8].map(eliasBits), [1, 3, 3, 5, 5, 7]);
  assert.equal(argBits(0, false), 1);
  assert.equal(argBits(-3, true), 5 + 1);
  assert.equal(namingBits({ menuSize: 8, lensSize: 4, argBits: 3 }), 3 + 2 + 3 + 1);
});

test("holding costs the small constant; up costs more than down by λ·|s|", () => {
  const hold = turnSurprise([5], [5]);
  assert.ok(Math.abs(hold - GRAVITY ** 2 / (2 * Math.LN2)) < 1e-12);
  const up = turnSurprise([7], [15]), down = turnSurprise([15], [7]);
  assert.ok(Math.abs(up - down - 1 * 1) < 1e-12); // s = 1 bit, λ = 1
});

test("a rise in one turn costs more than the same rise in several (big steps are super-linear)", () => {
  const one = turnSurprise([1], [127]); // 1 → 7 bits
  let six = 0;
  for (let k = 1; k < 7; k++) six += turnSurprise([2 ** k - 1], [2 ** (k + 1) - 1]);
  assert.ok(one > six * 2, `${one} vs ${six}`);
});

test("crossing zero pays the path down and up", () => {
  const plain = turnSurprise([7], [7]);
  const crossed = turnSurprise([7], [-7], [true]);
  assert.ok(crossed > plain + 10);
});

test("cost is never negative over random turns", () => {
  let seed = 1;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 20000; i++) {
    const n = 1 + Math.floor(r() * 4);
    const b = Array.from({ length: n }, () => Math.round((r() - 0.5) * 2 ** (r() * 30)));
    const a = b.map((x) => (r() < 0.5 ? x : Math.round((r() - 0.5) * 2 ** (r() * 30))));
    const crossed = b.map((x, j) => Math.sign(x) * Math.sign(a[j]) < 0 && r() < 0.5);
    const c = turnCost([namingBits({ menuSize: 6, lensSize: n, argBits: argBits(3, true) })], b, a, crossed);
    assert.ok(c.surprise >= 0 && c.total > 0);
  }
});
