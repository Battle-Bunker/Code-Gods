import assert from "node:assert/strict";
import test from "node:test";
import {
  actualLine, afterShareLine, agentState, energyLine, estimateLine, laneKind, num, plain, runwayFraction, runwayText, shareLine, skipLine, spentLine,
  statusText, summonLine, yourPowerLine,
} from "../src/core/panels/agent-labels.ts";
import { agentLabel } from "../src/core/panels/agent-name.ts";

test("numbers: one decimal at most, a real minus, energy as ⚡", () => {
  assert.equal(num(12.44), "12.4");
  assert.equal(num(16), "16");
  assert.equal(num(-12), "−12");
  assert.equal(num(-0.04), "0", "no negative zero");
  assert.equal(num(1234.5), "1,234.5");
  assert.equal(plain(summonLine(1)), "Summoned for 1 ⚡ (paid once)");
});

test("the player's own line says where the budget goes", () => {
  assert.equal(plain(yourPowerLine({ total: 64, allocated: 0.75, income: 16, energy: 230 })),
    "Your power: 64 ⚡/s — 75% to your agents, 25% (16 ⚡/s) refills your energy (230 ⚡) for summoning");
  assert.equal(plain(yourPowerLine({ total: 64, allocated: 1, income: 0, energy: 5 })),
    "Your power: 64 ⚡/s — 100% to your agents, nothing is left to refill your energy (5 ⚡) for summoning");
});

test("an agent's lines: share, energy (waiting when 0 or below), spending split, actual against estimate, skips", () => {
  assert.equal(plain(shareLine(0.25, 16)), "Power share 25% · earns 16 ⚡/s");
  assert.equal(plain(energyLine(42)), "Energy 42 ⚡");
  assert.equal(plain(energyLine(-12)), "Energy −12 ⚡: waiting for income");
  assert.equal(plain(energyLine(0)), "Energy 0 ⚡: waiting for income");
  assert.equal(plain(spentLine(310, 120, 25)), "Spent 310 ⚡ on 25 acts: 120 reading, 190 changing");
  assert.equal(plain(spentLine(310, undefined, 1)), "Spent 310 ⚡ on 1 act");
  assert.equal(plain(spentLine(10, 12, 2)), "Spent 10 ⚡ on 2 acts: 10 reading, 0 changing", "reading never exceeds the total");
  assert.equal(plain(actualLine(310, 25, 10.1)), "Actual average 12.4 ⚡ per act (estimate was 10.1)");
  assert.equal(plain(actualLine(0, 0, 10.1)), "No acts yet (estimate 10.1 ⚡ per act)");
  assert.equal(plain(estimateLine(10.1, { read: 6, change: 4.1 })), "Estimated at summon: 10.1 ⚡ per act (6 reading + 4.1 changing)");
  assert.equal(plain(estimateLine(10.1, undefined)), "Estimated at summon: 10.1 ⚡ per act");
  assert.equal(plain(skipLine(3)), "3 skipped (looked, did nothing; cheap)");
  assert.match(plain(skipLine(0)), /^No skips yet/);
});

test("every number-bearing sentence names a glossary term for its key word", () => {
  const terms = (segs: ReturnType<typeof yourPowerLine>) => segs.flatMap(s => (typeof s === "string" ? [] : [s.term]));
  assert.deepEqual(terms(yourPowerLine({ total: 8, allocated: 0.5, income: 4, energy: 1 })), ["power", "energy"]);
  assert.deepEqual(terms(spentLine(3, 1, 1)), ["read-bits", "change-cost"]);
  assert.deepEqual(terms(skipLine(1)), ["skip"]);
  assert.deepEqual(terms(shareLine(0.5, 4)), ["power-share"]);
});

test("state: energy 0 or below waits for income even if the server still says eligible; positive but not eligible is at its turn limit", () => {
  assert.equal(agentState({ energy: 0, eligible: true }), "waiting");
  assert.equal(agentState({ energy: -3, eligible: false }), "waiting");
  assert.equal(agentState({ energy: 5, eligible: false }), "limit");
  assert.equal(agentState({ energy: 5, eligible: true }), "can");
  assert.deepEqual([{ energy: 5, eligible: true }, { energy: 0, eligible: false }, { energy: 5, eligible: false }].map(laneKind), ["ok", "cool", "idle"]);
  assert.equal(statusText("waiting", false, 2.34), "waiting for income (about 2.3 s)");
  assert.equal(statusText("waiting", false, Infinity), "waiting for income");
  assert.equal(statusText("can", true, 0), "at the end: could act");
  assert.equal(statusText("limit", false, 0), "at its turn limit");
});

test("the energy meter is seconds of income, capped, and empty when in debt", () => {
  assert.equal(runwayFraction(5), 0.5);
  assert.equal(runwayFraction(50), 1);
  assert.equal(runwayFraction(-1), 0);
  assert.match(runwayText(8, 4), /^Holds 2 s of its income/);
  assert.match(runwayText(-8, 4), /^Holds 0 s/);
  assert.match(runwayText(8, 0), /No income/);
});

test("re-allocation preview and unnamed agents", () => {
  // 25% -> 50% while another agent holds 50%: the god keeps nothing; 64 bits/s total.
  assert.equal(afterShareLine(0.5, 0.25, 0.75, 64), "Then 50% (32 ⚡/s) goes to this agent and 0% (0 ⚡/s) stays with you.");
  assert.equal(afterShareLine(0.1, 0.25, 0.75, 64), "Then 10% (6.4 ⚡/s) goes to this agent and 40% (25.6 ⚡/s) stays with you.");
  assert.equal(agentLabel(undefined, 0), "Agent 1");
  assert.equal(agentLabel("  ", 1), "Agent 2");
  assert.equal(agentLabel("Hoarder", 1), "Hoarder");
});
