/**
 * The energy model's engine pieces (docs/energy-model.md): an agent's status for selection (lib/world.ts). Pure, no
 * backend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_AGENT_OPPORTUNITY_HZ, type GameSettings } from "@workspace/game-core";
import { agentStatus, godEnergy, secondsUntilEligible, settledAccount } from "../../convex/lib/world.ts";
import { agentCapacityOf, deityCapacityOf } from "../../convex/lib/power.ts";

/** Power 8 bits/s; the agents below hold a quarter of it: 2 bits/s each. No fullChargeSeconds: a game from before capacities. */
const settings = { powerPerSecond: 8 } as unknown as GameSettings;

test("an agent can be offered an opportunity while its energy is positive and the cap allows; no battery", () => {
  const fresh = { account: { balance: 0, settledWorldSeconds: 0 }, powerShare: 0.25 };
  assert.deepEqual(agentStatus(settings, fresh, 0), { energy: 0, eligible: false });
  assert.deepEqual(agentStatus(settings, fresh, 0.5), { energy: 1, eligible: true });
  // A game stored without fullChargeSeconds has no capacity: an agent that saves keeps it all.
  assert.equal(agentStatus(settings, fresh, 1000).energy, 2000);
  // In debt: it is offered nothing until income lifts it above zero.
  const owing = { account: { balance: -3, settledWorldSeconds: 10 }, powerShare: 0.25 };
  assert.equal(agentStatus(settings, owing, 11).eligible, false);
  assert.ok(Math.abs(secondsUntilEligible(settings, owing, 10) - 1.5) < 1e-3);
  // The cap: offered at 20, it waits 1/MAX_AGENT_OPPORTUNITY_HZ before the next.
  const busy = { account: { balance: 50, settledWorldSeconds: 20 }, lastOpportunityWorld: 20, powerShare: 0.25 };
  assert.equal(agentStatus(settings, busy, 20.1).eligible, false);
  assert.ok(Math.abs(secondsUntilEligible(settings, busy, 20.1) - (1 / MAX_AGENT_OPPORTUNITY_HZ - 0.1)) < 1e-9);
  assert.equal(agentStatus(settings, busy, 20 + 1 / MAX_AGENT_OPPORTUNITY_HZ).eligible, true);
  assert.equal(secondsUntilEligible(settings, { ...owing, powerShare: 0 }, 10), Infinity, "no share, no income");
});


test("capacity: an account holds at most its power × fullChargeSeconds, whenever it is read (docs/energy-model.md §6.1)", () => {
  const capped = { powerPerSecond: 8, fullChargeSeconds: 30 } as unknown as GameSettings;
  const fresh = { account: { balance: 0, settledWorldSeconds: 0 }, powerShare: 0.25 };   // 2 bits/s: holds 60
  assert.equal(agentCapacityOf(fresh, capped), 60);
  assert.equal(agentCapacityOf(fresh, settings), Infinity);
  assert.equal(agentStatus(capped, fresh, 10).energy, 20);
  assert.equal(agentStatus(capped, fresh, 30).energy, 60);
  assert.equal(agentStatus(capped, fresh, 1000).energy, 60, "income past a full store is not stored");
  // Its share was just lowered to 1/16 (0.5 bits/s: holds 15): the excess is gone at once, with no time passed.
  const lowered = { account: { balance: 60, settledWorldSeconds: 40 }, powerShare: 0.0625 };
  assert.deepEqual(settledAccount(capped, lowered, 40), { balance: 15, settledWorldSeconds: 40 });
  assert.deepEqual(settledAccount(capped, lowered, 12), { balance: 15, settledWorldSeconds: 40 }, "a clock behind the account's own still respects the capacity");
  // The deity's own account: (1 − allocated)·P·T.
  const deity = { account: { balance: 200, settledWorldSeconds: 0 }, allocated: 0.5 };       // keeps 4 bits/s: holds 120
  assert.equal(deityCapacityOf(deity, capped), 120);
  assert.equal(godEnergy({ settings: capped }, deity, 0), 120, "startingEnergy above the capacity is not held");
  assert.equal(godEnergy({ settings: capped }, { ...deity, allocated: 1 }, 100), 0, "all power allocated: nothing to summon with");
  assert.equal(godEnergy({ settings }, deity, 100), 600, "no capacity without the setting");
});
