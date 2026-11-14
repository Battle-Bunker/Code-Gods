/** The act charge of spec §6.1. Breaks caught: a wrong κ or β, a change charged when it did not commit, a free offer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { actCharge, BETA, changeCharge, KAPPA, READ_PRICE, readCharge } from "../src/index.ts";

test("κ = 32 and β = 0.05 are the economy's constants", () => {
  assert.equal(KAPPA, 32);
  assert.equal(BETA, 0.05);
  assert.equal(READ_PRICE, 1 / 32);
});

test("charge = R/κ + (committed ? W + β·W² : 0)", () => {
  // 64 bits read, two calls of 10 bits each: 2 + 20 + 0.05 × 400 = 42.
  assert.equal(actCharge({ readBits: 64, callBits: [10, 10], committed: true }), 42);
  // The same act whose change did not commit (a failure, no change, a collision) pays only for its reads.
  assert.equal(actCharge({ readBits: 64, callBits: [10, 10], committed: false }), 2);
  // A skip still pays for its offer: no outcome is free.
  assert.equal(actCharge({ readBits: Math.log2(8), callBits: [], committed: false }), 3 / 32);
  // Radical acts cost superlinearly: one 20-bit call costs more than two 10-bit acts.
  assert.equal(changeCharge([20]), 40);
  assert.ok(changeCharge([20]) > 2 * changeCharge([10]));
  assert.equal(changeCharge([]), 0);
  assert.equal(readCharge(32), 1);
});

test("negative or non-finite bits are refused", () => {
  for (const bad of [-1, NaN, Infinity]) {
    assert.throws(() => actCharge({ readBits: bad, callBits: [], committed: false }), /Invalid/);
    assert.throws(() => changeCharge([1, bad]), /Invalid/);
  }
});
