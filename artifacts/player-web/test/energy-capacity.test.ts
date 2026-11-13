import assert from "node:assert/strict";
import test from "node:test";
import { plain } from "../src/core/panels/agent-labels.ts";
import { agentDebtDetail, agentDebtLine, destroyDebtLine, fillText, fullIn, owedText, owes, ownEnergyLine, ownStoreFull, shareCapacityLines, storeFraction, storeState, storedLine } from "../src/core/panels/energy-capacity.ts";

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
  assert.equal(plain(ownEnergyLine({ energy: 480, income: 16, capacity: 480 })), "Your energy is full (480 ⚡). Energy pays for summoning; your agents run on their own share of your power.", "a fact, never an instruction to spend");
  assert.equal(ownStoreFull(480, 480), true);
  assert.equal(ownStoreFull(230, 480), false);
  assert.equal(ownStoreFull(0, 0), false);
  assert.equal(plain(ownEnergyLine({ energy: 0, income: 0, capacity: 0 })), "Your energy can hold nothing: all your power is with your agents. You cannot summon until you take some power back.");
  assert.deepEqual(ownEnergyLine({ energy: 230, income: 16, capacity: 480 }).flatMap(s => (typeof s === "string" ? [] : [s.term])), ["energy"]);
});

test("a share change that allocates everything says the player's own energy holds nothing, whatever the float rounding", () => {
  // 2% and 92% allocated; the 2% agent is raised to 8%: 1 − (0.94 − 0.02 + 0.08) is 1.1e-16 in floats, 0 as shares.
  const [, own] = shareCapacityLines({ newShare: 0.08, agentShare: 0.02, allocated: 0.94, total: 64, fullChargeSeconds: 30, agentEnergy: 0, ownEnergy: 0 });
  assert.match(own, /will hold nothing/);
  assert.match(own, /cannot summon/);
});

// Debt (docs/energy-model.md §7.2). Hand-derived with power 64 bits/s and full charge 30 s: a 25% agent may owe at most 480 bits.

test("what is owed: a number only when it shows as one", () => {
  assert.equal(owes(-312), 312);
  assert.equal(owes(-0.04), 0, "shows as 0");
  assert.equal(owes(5), 0);
  assert.equal(owedText(-312), "overdrawn by 312 ⚡");
  assert.equal(owedText(0), null);
  assert.equal(owedText(42), null);
});

test("an agent in debt says how much it owes and how much it may owe", () => {
  assert.equal(agentDebtLine(-120, 480), "Overdrawn by 120 ⚡; it waits for income.", "never 'owes' (read as: to whom?); the bound is not in the main line");
  assert.equal(agentDebtLine(-120, 0), "Overdrawn by 120 ⚡; it waits for income.");
  assert.equal(agentDebtDetail(480), "Its acts cost more energy than it held. It may be overdrawn by at most 480, and it acts again once its income has covered this.", "the bound, for the tooltip");
  assert.equal(agentDebtDetail(0), null, "no power: no limit to name");
  assert.equal(agentDebtDetail(undefined), null);
  assert.equal(agentDebtLine(0, 480), null);
  assert.equal(agentDebtLine(42, 480), null);
  assert.equal(agentDebtLine(-120, undefined), null, "a game without capacity looks as it did");
});

test("destroying an agent that owes: its debt moves to the player", () => {
  const base = { agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30 };
  // 100 − 412 = −312. Its 25% returns: you keep 50% = 32 bits/s, so 312 / 32 = 9.75 → 10 s.
  assert.equal(destroyDebtLine({ ...base, agentEnergy: -412, ownEnergy: 100 }),
    "This agent is overdrawn by 412 ⚡: if you destroy it, that moves to your own energy. Your own energy will be −312 ⚡, and you cannot summon until your income has covered it (about 10 s).");
  // 500 − 412 = 88 left.
  assert.equal(destroyDebtLine({ ...base, agentEnergy: -412, ownEnergy: 500 }),
    "This agent is overdrawn by 412 ⚡: if you destroy it, that moves to your own energy and is paid from it (88 ⚡ left).");
  // A 0% agent while everything is with the others: nothing comes back, so there is no income to repay it.
  assert.equal(destroyDebtLine({ agentShare: 0, allocated: 1, total: 64, fullChargeSeconds: 30, agentEnergy: -40, ownEnergy: 0 }),
    "This agent is overdrawn by 40 ⚡: if you destroy it, that moves to your own energy. Your own energy will be −40 ⚡, and you cannot summon until you keep some power for yourself.");
  assert.equal(destroyDebtLine({ ...base, agentEnergy: 5, ownEnergy: 100 }), null);
  assert.equal(destroyDebtLine({ ...base, agentEnergy: 0, ownEnergy: 100 }), null);
  assert.equal(destroyDebtLine({ ...base, fullChargeSeconds: undefined, agentEnergy: -412, ownEnergy: 100 }), null);
});

test("lowering the share of an agent that owes: the same fraction of its debt moves to the player", () => {
  const base = { agentShare: 0.25, allocated: 0.75, total: 64, fullChargeSeconds: 30, agentEnergy: -412 };
  // 25% → 12.5% takes half its power: 206 of 412 move. 100 − 206 = −106; you keep 37.5% = 24 bits/s: 106 / 24 = 4.4 → 5 s.
  const lines = shareCapacityLines({ ...base, newShare: 0.125, ownEnergy: 100 });
  assert.equal(lines.length, 3);
  assert.equal(lines[2], "It is overdrawn by 412 ⚡: 206 of that moves to you. Your own energy will be −106 ⚡, and you cannot summon until your income has covered it (about 5 s).");
  // 230 − 206 = 24 left.
  assert.equal(shareCapacityLines({ ...base, newShare: 0.125, ownEnergy: 230 })[2], "It is overdrawn by 412 ⚡: 206 of that moves to you. It is paid from your own energy (24 ⚡ left).");
  // To 0%: all of it. 100 − 412 = −312; you keep 50% = 32 bits/s: 9.75 → 10 s.
  assert.equal(shareCapacityLines({ ...base, newShare: 0, ownEnergy: 100 })[2],
    "It is overdrawn by 412 ⚡: all of that moves to you. Your own energy will be −312 ⚡, and you cannot summon until your income has covered it (about 10 s).");
  // Raising its share moves none of its debt.
  assert.equal(shareCapacityLines({ ...base, allocated: 0.5, newShare: 0.5, ownEnergy: 100 }).length, 2);
});

test("raising a share while the player owes: the agent takes the same fraction of the debt as of the unallocated power", () => {
  // You keep 50%; 25% → 50% gives the agent half of it: 156 of 312 move. It holds 400: no debt for it.
  const base = { newShare: 0.5, agentShare: 0.25, allocated: 0.5, total: 64, fullChargeSeconds: 30, ownEnergy: -312 };
  assert.equal(shareCapacityLines({ ...base, agentEnergy: 400 })[2], "You are overdrawn by 312 ⚡: 156 of that moves to this agent.");
  // It holds 100: 100 − 156 = −56.
  assert.equal(shareCapacityLines({ ...base, agentEnergy: 100 })[2], "You are overdrawn by 312 ⚡: 156 of that moves to this agent. It will be overdrawn by 56 ⚡ and wait for its income to cover it.");
  // You keep 25% and give all of it: everything moves.
  assert.equal(shareCapacityLines({ ...base, allocated: 0.75, agentEnergy: 400 })[2], "You are overdrawn by 312 ⚡: all of that moves to this agent.");
  // Lowering a share moves none of your debt.
  assert.equal(shareCapacityLines({ ...base, newShare: 0.125, agentEnergy: 400 }).length, 2);
});

test("your own energy below zero: what you owe and when you can summon again, and no meter", () => {
  // 312 / 32 = 9.75 → 10 s.
  assert.equal(plain(ownEnergyLine({ energy: -312, income: 32, capacity: 960 })), "You are overdrawn by 312 ⚡: you cannot summon until your income has covered it (about 10 s).");
  assert.equal(plain(ownEnergyLine({ energy: -312, income: 0, capacity: 0 })), "You are overdrawn by 312 ⚡ and keep no power for yourself: take some power back from an agent to cover it.");
});
