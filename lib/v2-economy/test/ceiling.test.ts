/**
 * The own store's ceiling (coordinator, 2026-11-14; the owner is deciding between a larger store, instalments or
 * keeping it): a player's own store holds at most fullChargeSeconds × its income, so at full power (no agents) it never
 * holds more than P·T. A summon is paid from the own store at once (convex/v2/agents.ts pay → spend), so a program
 * priced above P·T can never be summoned, however long the player waits. This test pins today's behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeOwn, energyCapacity, LINES_BEGINNER_ECONOMY as E, movePower, newAccount, settleOwn } from "../src/index.ts";

const power = { powerPerSecond: E.powerPerSecond, allocated: 0, fullChargeSeconds: E.fullChargeSeconds };
const ceiling = E.powerPerSecond * E.fullChargeSeconds;   // 64 × 30 = 1,920 ⚡ on the beginner economy

test("at full power the own store fills to P·T and no further, however long the game runs", () => {
  assert.equal(ceiling, 1920);
  assert.equal(energyCapacity(E.powerPerSecond, E.fullChargeSeconds), ceiling);
  for (const seconds of [E.fullChargeSeconds, 600, 86_400]) assert.equal(settleOwn(newAccount(0, E.startingEnergy), seconds, power).balance, ceiling);
});

test("a price above the ceiling can never be paid; one at the ceiling can", () => {
  const full = settleOwn(newAccount(0, E.startingEnergy), 10_000, power);
  assert.doesNotThrow(() => chargeOwn(full, ceiling, 10_000, power));
  assert.throws(() => chargeOwn(full, ceiling + 1, 10_000, power), /Insufficient energy/);
});

test("pulling every agent's power back does not lift the ceiling: the energy that comes back is capped by the store", () => {
  // An agent with all the power and a full store of its own; the player's store is full too (capacity 0 then).
  const agent = { balance: ceiling, settledWorldSeconds: 100 }, own = { balance: 0, settledWorldSeconds: 100 };
  const back = movePower(agent, own, 1, 0.001, 0, ceiling);
  assert.ok(back.own.balance <= ceiling + 1e-9, `${back.own.balance}`);
  assert.ok(back.own.balance + back.agent.balance <= ceiling + 1e-9, "nothing is created");
});
