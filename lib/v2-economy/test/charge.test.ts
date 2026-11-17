/** The act charge of spec §6.1. Breaks caught: a wrong κ or β, a change charged when it did not commit, a free offer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { actCharge, changeCharge, KAPPA, READ_PRICE, readCharge } from "../src/index.ts";

test("κ = 32 is the economy's constant", () => {
  assert.equal(KAPPA, 32);
  assert.equal(READ_PRICE, 1 / 32);
});

test("charge = R/κ + (committed ? W : 0): energy is bits", () => {
  // 64 bits read, a turn of 20 bits: 2 + 20.
  assert.equal(actCharge({ readBits: 64, callBits: [10, 10], committed: true }), 22);
  // The same act whose change did not commit (a failure, no change, a collision) pays only for its reads.
  assert.equal(actCharge({ readBits: 64, callBits: [10, 10], committed: false }), 2);
  // A skip still pays for its offer: no outcome is free.
  assert.equal(actCharge({ readBits: Math.log2(8), callBits: [], committed: false }), 3 / 32);
  assert.equal(changeCharge([20]), 20);
  assert.equal(changeCharge([]), 0);
  assert.equal(readCharge(32), 1);
});

test("negative or non-finite bits are refused", () => {
  for (const bad of [-1, NaN, Infinity]) {
    assert.throws(() => actCharge({ readBits: bad, callBits: [], committed: false }), /Invalid/);
    assert.throws(() => changeCharge([1, bad]), /Invalid/);
  }
});
