/**
 * Agent sandbox readiness (convex/lib/sandboxes.ts): pure, no backend. Times are literal milliseconds, so every
 * expectation can be checked by eye against the constants the module exports.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_WARM_MS, RETRY_BASE_MS, RETRY_MAX_MS, WARM_TIMEOUT_MS,
  effectiveSandbox, needsWarm, planningEnd, retryDelay, type ReadinessRow,
} from "../../convex/lib/sandboxes.ts";

const row = (over: Partial<ReadinessRow>): ReadinessRow =>
  ({ language: "python", version: "v1", state: "ready", attemptAt: 1_000, attempts: 1, readyAt: 2_000, ...over });

test("a language never warmed, or warmed by other code, reads as warming", () => {
  assert.deepEqual(effectiveSandbox(null, "v1"), { state: "warming" });
  assert.deepEqual(effectiveSandbox(row({ version: "v0" }), "v1"), { state: "warming" }, "a redeploy with a new bundle needs a new boot");
  assert.deepEqual(effectiveSandbox(row({}), "v1"), { state: "ready" });
  assert.deepEqual(effectiveSandbox(row({ state: "failed", reason: "no bundle" }), "v1"), { state: "failed", reason: "no bundle" });
  // A query cannot compute the code's version: it trusts the row.
  assert.deepEqual(effectiveSandbox(row({ version: "v0" })), { state: "ready" });
});

test("failed boots retry with a doubling backoff, capped", () => {
  assert.equal(retryDelay(1), RETRY_BASE_MS);
  assert.equal(retryDelay(2), 2 * RETRY_BASE_MS);
  assert.equal(retryDelay(3), 4 * RETRY_BASE_MS);
  assert.equal(retryDelay(50), RETRY_MAX_MS);
});

test("a warm-up is scheduled only when one is due", () => {
  const now = 100_000;
  assert.equal(needsWarm(null, { now, version: "v1" }), true, "never warmed");
  assert.equal(needsWarm(row({ version: "v0" }), { now, version: "v1" }), true, "other code's boot does not count");
  assert.equal(needsWarm(row({}), { now, version: "v1" }), false, "ready");

  const warming = row({ state: "warming", attemptAt: now - 5_000, readyAt: undefined });
  assert.equal(needsWarm(warming, { now, version: "v1" }), false, "one warm-up in flight at a time");
  assert.equal(needsWarm({ ...warming, attemptAt: now - WARM_TIMEOUT_MS - 1 }, { now, version: "v1" }), true, "a lost warm-up is retried");

  const failed = row({ state: "failed", attempts: 2, attemptAt: now - 2 * RETRY_BASE_MS + 1, reason: "boom" });
  assert.equal(needsWarm(failed, { now, version: "v1" }), false, "inside the backoff");
  assert.equal(needsWarm({ ...failed, attemptAt: now - 2 * RETRY_BASE_MS }, { now, version: "v1" }), true, "backoff over");
});

test("keep-warm re-boots a ready runtime at most once per KEEP_WARM_MS", () => {
  const now = 1_000_000;
  assert.equal(needsWarm(row({ attemptAt: now - KEEP_WARM_MS + 1 }), { now, version: "v1", keepWarm: true }), false);
  assert.equal(needsWarm(row({ attemptAt: now - KEEP_WARM_MS }), { now, version: "v1", keepWarm: true }), true);
  assert.equal(needsWarm(row({ attemptAt: now - KEEP_WARM_MS }), { now, version: "v1" }), false, "only proactive callers keep warm");
});

test("planning ends at its deadline, or when the last sandbox became ready, whichever is later", () => {
  const deadline = 60_000;
  assert.deepEqual(planningEnd(deadline, [{ state: "ready", readyAt: 10_000 }, { state: "ready", readyAt: 20_000 }]), { at: deadline });
  assert.deepEqual(planningEnd(deadline, [{ state: "ready", readyAt: 10_000 }, { state: "ready", readyAt: 61_500 }]), { at: 61_500 },
    "world time starts when every allowed language can run, never retroactively");
  assert.deepEqual(planningEnd(deadline, [{ state: "ready", readyAt: 10_000 }, { state: "warming" }]), { hold: true });
  assert.deepEqual(planningEnd(deadline, [{ state: "failed", reason: "x" }]), { hold: true });
});
