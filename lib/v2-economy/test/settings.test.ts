/** The beginner economy and the opportunity count. Breaks caught: a preset whose first agent cannot be paid in planning; an opportunity count that drifts from rate × time or accumulates. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { assertEconomy, defaultShare, energyCapacity, firstAgentShare, LINES_BEGINNER_ECONOMY, opportunities, ownIncome } from "../src/index.ts";

test("Lines · beginner: the starting energy fits the planning store, and the first agent leaves room for the dearest starter", () => {
  const e = LINES_BEGINNER_ECONOMY;
  assert.doesNotThrow(() => assertEconomy(e));
  const whole = e.powerPerSecond * e.fullChargeSeconds;
  assert.equal(whole, 1920);
  assert.ok(e.startingEnergy <= whole);
  // Today's dearest beginner starter (573 bits): the first agent takes as much power as still lets the store hold it.
  assert.equal(firstAgentShare({ allocated: 0, powerPerSecond: e.powerPerSecond, fullChargeSeconds: e.fullChargeSeconds, need: 573 }), 0.701562);
  // After a default first summon the own store (half the power) still holds the starting energy.
  assert.ok(energyCapacity(ownIncome(e.powerPerSecond, defaultShare(0)), e.fullChargeSeconds) >= e.startingEnergy);
  assert.throws(() => assertEconomy({ ...e, fullChargeSeconds: 0 }), /fullChargeSeconds/);
  assert.throws(() => assertEconomy({ ...e, powerPerSecond: NaN }), /powerPerSecond/);
});

test("opportunities: rate × window, stochastically rounded; a whole count draws nothing", () => {
  const r = rng("opportunities");
  let total = 0;
  for (let i = 0; i < 20000; i++) {
    const n = opportunities(25, 0.13, r);   // 3.25 expected
    assert.ok(n === 3 || n === 4);
    total += n;
  }
  assert.ok(Math.abs(total / 20000 - 3.25) < 0.02, `${total / 20000}`);
  const a = rng("whole"), b = rng("whole");
  assert.equal(opportunities(25, 2, a), 50);
  assert.equal(a.uint32(), b.uint32(), "nothing drawn");
  assert.equal(opportunities(0, 5, a), 0);
  assert.throws(() => opportunities(25, -1, a));
});
