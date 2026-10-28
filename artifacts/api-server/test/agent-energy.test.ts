import test from "node:test";
import assert from "node:assert/strict";
import { accrued, charged, eligible, newAgentEnergy, worldNow, FAILED_ACT_BITS } from "../src/game/agent-energy.ts";

const knobs = { agentEnergyPerSecond: 2, agentBatteryActs: 2 };

test("a new agent may act at once; acting costs the actual bits and may go negative", () => {
  let e = newAgentEnergy(10);
  assert.ok(eligible(e));
  e = charged(e, 20);
  assert.equal(e.balance, -20);
  assert.equal(e.expectedCost, 20);
  assert.ok(!eligible(e), "a cooldown follows an expensive act");
  e = accrued(e, 25, knobs); // 15 s × 2 bits/s
  assert.equal(e.balance, 10);
  assert.ok(!eligible(e));
  e = accrued(e, 30, knobs);
  assert.equal(e.balance, 20);
  assert.ok(eligible(e));
});

test("income is capped at battery × expected cost; world time only", () => {
  let e = charged(newAgentEnergy(0), 10);
  e = accrued(e, 1000, knobs);
  assert.equal(e.balance, 20, "battery = 2 expected acts");
  assert.equal(accrued(e, 900, knobs), e, "time never runs backwards");
  e = charged(e, 0);
  assert.equal(e.expectedCost, 7, "exponential average of act costs");
  assert.equal(worldNow({ phase: "paused", worldSeconds: 12, lastTick: 0 } as never, 1e12), 12, "paused worlds do not advance");
  assert.equal(worldNow({ phase: "running", worldSeconds: 12, lastTick: 1000 } as never, 3000), 14);
  assert.throws(() => charged(e, -1));
  assert.ok(FAILED_ACT_BITS > 0);
});
