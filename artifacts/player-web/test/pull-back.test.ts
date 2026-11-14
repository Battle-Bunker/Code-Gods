import { test } from "node:test";
import assert from "node:assert/strict";
import { proposedSplit, pullBackPlan, PULL_SHARE } from "../src/panes/pull-back.ts";

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
