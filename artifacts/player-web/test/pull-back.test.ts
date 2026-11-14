import { test } from "node:test";
import assert from "node:assert/strict";
import { proposedSplit, pullBackPlan, PULL_SHARE } from "../src/panes/pull-back.ts";
import { shortfallOf, shortText } from "../src/panes/pull-back.ts";

// power 64 ⚡/s; one agent at 70% leaves the store 19.2 ⚡/s; the store holds 30 s of its income.
const base = { power: 64, energy: 100, chargeSeconds: 30, agents: [{ agentId: "a", share: 0.7 }] };

test("pulling power back leaves each agent a sliver and says how long the store then takes", () => {
  const plan = pullBackPlan({ ...base, price: 300 })!;
  assert.deepEqual(plan.shares, { a: PULL_SHARE });
  const income = 64 * (1 - PULL_SHARE);
  assert.equal(plan.perSecond, income);
  assert.equal(plan.seconds, Math.ceil((300 - 100) / income));
  assert.equal(plan.fits, true);
});

test("no plan without agents to pull from, or when the store is already enough", () => {
  assert.equal(pullBackPlan({ ...base, agents: [], price: 300 }), null);
  assert.equal(pullBackPlan({ ...base, price: 50 }), null);
});

test("a price above what even the whole power can store says so", () => {
  assert.equal(pullBackPlan({ ...base, price: 64 * 30 + 1 })!.fits, false);
});

test("the proposed split gives the new agent an equal part of what the agents held before; you keep the rest as before", () => {
  assert.deepEqual(proposedSplit({ a: 0.7 }, "b"), { a: 0.35, b: 0.35 });
  assert.deepEqual(proposedSplit({ a: 0.4, b: 0.2 }, "c"), { a: 0.2667, b: 0.1333, c: 0.2 }, "rounded to whole hundredths of a percent");
  assert.deepEqual(proposedSplit({ a: 0.7 }, null), { a: 0.7 }, "after an edit: the split as it was");
});

test("a refused purchase's shortfall is read from the server's numbers, and said with both ways to pay", () => {
  // Catches (playtest round 5): 13 ⚡ short, the offer to pull power back lived about a second and was never seen.
  const e = Object.assign(new Error("That program costs 456.4 ⚡; you have 443.6."), { data: { price: 456.45, store: 443.55, perSecond: 9.6, capacity: 576, secondsToPay: 1.34, payNow: { shares: { a1: 0.01 } } } });
  const s = shortfallOf(e)!;
  assert.deepEqual(s, { price: 456.45, store: 443.55, secondsToPay: 1.34, payNow: { a1: 0.01 } });
  assert.equal(shortText(s, "summon"), "This summon costs 456.45 ⚡ and your store holds 443.55 ⚡: it pays by itself in about 2 seconds, or pull power back from your agents to pay now.");
  assert.equal(shortText({ ...s, secondsToPay: null }, "edit"), "This edit costs 456.45 ⚡ and your store holds 443.55 ⚡: waiting never pays it at this split. Pull power back from your agents, or shorten the code.");
  assert.equal(shortfallOf(new Error("no numbers")), null);
  assert.equal(shortfallOf({ data: { price: "x" } }), null);
});
