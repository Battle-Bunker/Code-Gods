import { test } from "node:test";
import assert from "node:assert/strict";
import { dynamicsFailures, failureCount, oneClosedForm, rampFails, riseTogether, singleFails, stalled, tableCheap, togetherFails } from "../src/collapse.ts";

test("rules rise together when two gain by the midpoint and more by the end; a third falling as much is an adversary", () => {
  assert.deepEqual(riseTogether([0, 0, 10], [3, 3, 10], [6, 5, 10]), { together: true, adversary: false });
  assert.deepEqual(riseTogether([0, 0, 10], [3, 3, 8], [6, 5, 7]), { together: true, adversary: true });
  assert.deepEqual(riseTogether([0, 0, 10], [3, 1, 10], [6, 5, 10]), { together: false, adversary: false });   // one rose too little by the midpoint
  assert.deepEqual(riseTogether([0, 0, 10], [3, 3, 10], [3, 5, 10]), { together: false, adversary: false });   // one stopped rising
  assert.equal(togetherFails(5, 20), true);
  assert.equal(togetherFails(4, 20), false);
});

test("dynamics fails on a still board, a frozen board for the shortcut climber, or gains that stop by the midpoint", () => {
  assert.deepEqual(dynamicsFailures({ movingPerMinute: 0.3, frozenShare: 0.4, stalledEvery: false }), []);
  assert.deepEqual(dynamicsFailures({ movingPerMinute: 0.2, frozenShare: 0.6, stalledEvery: true }), ["a", "b", "c"]);
  assert.equal(stalled({ gainedByMid: 1000, gainedByEnd: 1010 }), true);
  assert.equal(stalled({ gainedByMid: 1000, gainedByEnd: 1100 }), false);
});

test("a rule ramps only when all three conditions hold", () => {
  assert.equal(rampFails({ topCostShare: 0.98, growth: 0.8, corr: 0.99 }), true);
  assert.equal(rampFails({ topCostShare: 0.98, growth: 0.8, corr: 0.5 }), false);
  assert.equal(rampFails({ topCostShare: 0.5, growth: 0.8, corr: 0.99 }), false);
  assert.equal(rampFails({ topCostShare: 0.98, growth: 0.05, corr: 0.99 }), false);
});

test("a table is cheap at 95% of the reference", () => {
  assert.equal(tableCheap(95, 100), true);
  assert.equal(tableCheap(94, 100), false);
});

test("one closed form: one free coordinate, the others in at most two classes up to sign", () => {
  // y = ±x + a prime, or ±2x + a prime
  assert.equal(oneClosedForm([[1, 59], [-1, 59], [2, 53], [-1, 47]]), true);
  assert.equal(oneClosedForm([[1, 59], [3, 59], [5, 59], [7, -59]]), true);   // c held: m free
  assert.equal(oneClosedForm([[1, 59], [3, 53], [5, 47]]), false);
  assert.equal(singleFails({ keep: 0.9, closedForm: true }), true);
  assert.equal(singleFails({ keep: 0.9, closedForm: false }), false);
});

test("the final count adds every FAIL over the rows", () => {
  assert.equal(failureCount([{ verdicts: { "1": "FAIL", "2": "PASS" } }, { verdicts: { "1": "FAIL", "5": "FAIL", "3": "skip" } }]), 3);
});
