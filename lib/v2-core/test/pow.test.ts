/**
 * `pow` is the v2 packages' power: the same bits on every runtime (src/pow.ts). What would break: a whole power that is
 * not exact (prices and Kraft sums are built from 2^−k), or a value far from the true power.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pow, pow2 } from "../src/pow.ts";

test("whole powers of two are exact, both ways, to the ends of the double range", () => {
  for (const k of [0, 1, 2, 10, 31, 32, 52, 53, 60, 1023]) assert.equal(pow2(k), Number(2n ** BigInt(k)), `2^${k}`);
  assert.equal(pow2(-1), 0.5);
  assert.equal(pow2(-3), 0.125);
  assert.equal(pow2(-60), 1 / Number(2n ** 60n));
  assert.equal(pow2(-1074), Number.MIN_VALUE);
  assert.equal(pow2(1024), Infinity);
});

test("whole powers of other numbers are products", () => {
  assert.equal(pow(3, 4), 81);
  assert.equal(pow(10, 15), 1e15);
  assert.equal(pow(1.1, 2), 1.1 * 1.1);
  assert.equal(pow(7, -1), 1 / 7);
  assert.equal(pow(-2, 3), -8);
  assert.equal(pow(5, 0), 1);
  assert.equal(pow(0, 0), 1);
});

test("a half is the square root", () => {
  assert.equal(pow(2, 0.5), Math.SQRT2);
  assert.equal(pow(9, 0.5), 3);
  assert.equal(pow(4, -0.5), 0.5);
});

test("fractional powers are within a few parts in 10^15 of the true value", () => {
  // Hand values: 2^1.5 = 2√2, 2^(1/3)·2^(2/3) = 2, 8^(1/3) = 2, 10^−0.5 = 1/√10.
  const close = (x: number, want: number) => assert.ok(Math.abs(x / want - 1) < 4e-15, `${x} against ${want}`);
  close(pow2(1.5), 2 * Math.SQRT2);
  close(pow2(1 / 3) * pow2(2 / 3), 2);
  close(pow(8, 1 / 3), 2);
  close(pow(10, -0.25) * pow(10, -0.25), 1 / Math.sqrt(10));
  close(pow2(-17.3) * pow2(17.3), 1);
});

test("the edges behave as a power does", () => {
  assert.equal(pow(0, 1.5), 0);
  assert.equal(pow(0, -1.5), Infinity);
  assert.ok(Number.isNaN(pow(-2, 1.5)));
  assert.ok(Number.isNaN(pow(2, NaN)));
  assert.equal(pow2(-Infinity), 0);
  assert.equal(pow2(Infinity), Infinity);
});
