/**
 * The energy model's engine pieces (docs/energy-model.md): an agent's status for selection (lib/world.ts). Pure, no
 * backend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_AGENT_OPPORTUNITY_HZ, type GameSettings } from "@workspace/game-core";
import { agentStatus, secondsUntilEligible } from "../../convex/lib/world.ts";

/** Power 8 bits/s; the agents below hold a quarter of it: 2 bits/s each. */
const settings = { powerPerSecond: 8 } as unknown as GameSettings;

test("an agent can be offered an opportunity while its energy is positive and the cap allows; no battery", () => {
  const fresh = { account: { balance: 0, settledWorldSeconds: 0 }, powerShare: 0.25 };
  assert.deepEqual(agentStatus(settings, fresh, 0), { energy: 0, eligible: false });
  assert.deepEqual(agentStatus(settings, fresh, 0.5), { energy: 1, eligible: true });
  // Income is never capped: an agent that saves keeps it all.
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

