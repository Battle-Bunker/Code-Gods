import assert from "node:assert/strict";
import test from "node:test";
import { plain } from "../src/core/panels/agent-labels.ts";
import { fillText, fullIn, ownEnergyLine, shareCapacityLines, storeFraction, storeState, storedLine } from "../src/core/panels/energy-capacity.ts";

// Hand-derived: power 64 bits/s, full charge 30 s. A 25% agent earns 16 bits/s and holds at most 16 × 30 = 480 bits.

test("time to full: whole seconds, never 0 while filling, minutes from two minutes on", () => {
  assert.equal(fullIn(9), "full in 9 s");
  assert.equal(fullIn(22.5), "full in 23 s");
  assert.equal(fullIn(0.2), "full in 1 s");
  assert.equal(fullIn(119), "full in 119 s");
  assert.equal(fullIn(300), "full in 5 min");
});

test("an agent's store: debt, filling, full (income wasted), or no income", () => {
  assert.equal(storeState(-12, 16, 480), "debt");
  assert.equal(storeState(0, 16, 480), "debt", "0 or below waits for income, as before");
  assert.equal(storeState(336, 16, 480), "filling");
  assert.equal(storeState(480, 16, 480), "full");
  assert.equal(storeState(5, 0, 0), "idle", "no power: nothing fills and nothing is wasted");
  assert.equal(plain(storedLine(336, 480)), "Energy 336 of 480 ⚡");
  assert.deepEqual(storedLine(336, 480).flatMap(s => (typeof s === "string" ? [] : [s.term])), ["agent-energy"]);
  assert.equal(storeFraction(336, 480), 0.7);
  assert.equal(storeFraction(-12, 480), 0);
  assert.equal(storeFraction(500, 480), 1);
  assert.equal(storeFraction(5, 0), 0);
  // (480 − 336) / 16 = 9 s.
  assert.equal(fillText(336, 16, 480), "full in 9 s");
  assert.equal(fillText(480, 16, 480), "Full: its income is being wasted. Use it or re-allocate it.");
  assert.equal(fillText(5, 0, 0), "no income");
});

test("lowering a share: the agent holds less, and loses what it holds above the new limit", () => {
  // 25% → 12.5%: 480 → 8 × 30 = 240 ⚡; it holds 400, so 160 are lost. You keep 25% → 37.5%: 480 → 24 × 30 = 720.
  assert.deepEqual(shareCapacityLines({ newShare: 0.125, agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: 400, ownEnergy: 230 }), [
    "This agent will hold at most 240 ⚡ (now 480): 160 ⚡ it holds above that will be lost.",
    "Your own energy will hold at most 720 ⚡ (now 480).",
  ]);
  // It holds 100, under the new 240: no loss to mention.
  assert.equal(shareCapacityLines({ newShare: 0.125, agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: 100, ownEnergy: 230 })[0],
    "This agent will hold at most 240 ⚡ (now 480).");
  // In debt: nothing above the limit.
  assert.equal(shareCapacityLines({ newShare: 0, agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: -12, ownEnergy: 0 })[0],
    "This agent will hold nothing (now at most 480 ⚡).");
});

test("raising a share: your own energy holds less, and loses what it holds above the new limit", () => {
  // 25% → 50% with 50% given out: you keep 50% → 25%: 32 × 30 = 960 → 16 × 30 = 480; you hold 700, so 220 are lost.
  assert.deepEqual(shareCapacityLines({ newShare: 0.5, agentShare: 0.25, allocated: 0.5, total: 64, fullChargeSeconds: 30, agentEnergy: 400, ownEnergy: 700 }), [
    "This agent will hold at most 960 ⚡ (now 480).",
    "Your own energy will hold at most 480 ⚡ (now 960): 220 ⚡ above that will be lost.",
  ]);
  // Everything given away: 25% → 50% with 75% given out leaves you 0%.
  assert.deepEqual(shareCapacityLines({ newShare: 0.5, agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: 0, ownEnergy: 230 }), [
    "This agent will hold at most 960 ⚡ (now 480).",
    "Your own energy will hold nothing (now at most 480 ⚡): the 230 ⚡ you hold will be lost, and you cannot summon until you take power back.",
  ]);
  assert.equal(shareCapacityLines({ newShare: 0.5, agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: 0, ownEnergy: 0 })[1],
    "Your own energy will hold nothing (now at most 480 ⚡): you cannot summon until you take power back.");
});

test("a game without the rule says nothing about capacity", () => {
  assert.deepEqual(shareCapacityLines({ newShare: 0.5, agentShare: 0.25, allocated: 0.5, total: 64, fullChargeSeconds: undefined, agentEnergy: 400, ownEnergy: 700 }), []);
});

test("your own energy: fills and then stops; full; or holds nothing when all power is given away", () => {
  // (480 − 230) / 16 = 15.6 → 16 s.
  assert.equal(plain(ownEnergyLine({ energy: 230, income: 16, capacity: 480 })), "Your energy: 230 of 480 ⚡. It fills in 16 s and then stops.");
  assert.equal(plain(ownEnergyLine({ energy: 480, income: 16, capacity: 480 })), "Your energy: 480 of 480 ⚡. It is full: its income is being wasted. Summon with it or give your agents more power.");
  assert.equal(plain(ownEnergyLine({ energy: 0, income: 0, capacity: 0 })), "Your energy can hold nothing: all your power is with your agents. You cannot summon until you take some power back.");
  assert.deepEqual(ownEnergyLine({ energy: 230, income: 16, capacity: 480 }).flatMap(s => (typeof s === "string" ? [] : [s.term])), ["energy"]);
});

test("a share change that allocates everything says the player's own energy holds nothing, whatever the float rounding", () => {
  // 2% and 92% allocated; the 2% agent is raised to 8%: 1 − (0.94 − 0.02 + 0.08) is 1.1e-16 in floats, 0 as shares.
  const [, own] = shareCapacityLines({ newShare: 0.08, agentShare: 0.02, allocated: 0.94, total: 64, fullChargeSeconds: 30, agentEnergy: 0, ownEnergy: 0 });
  assert.match(own, /will hold nothing/);
  assert.match(own, /cannot summon/);
});
