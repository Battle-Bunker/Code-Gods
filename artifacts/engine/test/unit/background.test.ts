/** Background work's rules (convex/lib/background.ts): pure, no backend. */
import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_LIMITS, TICK_OVERDUE_MS, slotAttemptDelays, slotFree, tickOverdue } from "../../convex/lib/background.ts";

test("a background job takes a slot only below the cap; expired slots do not count", () => {
  const now = 50_000, live = now + 1, dead = now;
  assert.equal(slotFree([], now, 3), true);
  assert.equal(slotFree([live, live], now, 3), true);
  assert.equal(slotFree([live, live, live], now, 3), false);
  assert.equal(slotFree([live, live, dead, dead], now, 3), true);
  // Every examination and its nested actions and every AI seat turn leave most of 64 actions to ticks.
  assert.ok(BACKGROUND_LIMITS.examination * 3 + BACKGROUND_LIMITS.turn * 4 <= 40);
});

test("only a running game whose last commit is old is overdue", () => {
  const now = 1_000_000;
  assert.equal(tickOverdue({ phase: "running", lastTick: now - TICK_OVERDUE_MS }, now), false);
  assert.equal(tickOverdue({ phase: "running", lastTick: now - TICK_OVERDUE_MS - 1 }, now), true);
  // Planning and pauses commit nothing by design: never overdue.
  assert.equal(tickOverdue({ phase: "planning", lastTick: now - 3_600_000 }, now), false);
  assert.equal(tickOverdue({ phase: "paused", lastTick: now - 3_600_000 }, now), false);
});

test("a waiting job asks again a few times, further apart, and never past its wait", () => {
  assert.deepEqual(slotAttemptDelays(0, () => 0), []);
  assert.deepEqual(slotAttemptDelays(999, () => 0), []);
  // A player's examination (3 s): one more attempt, a second or two later.
  assert.deepEqual(slotAttemptDelays(3000, () => 0.5), [1500]);
  // 1 + 2 + 3 + 4 = 10 s; a fifth (5 s) would pass 12 s.
  assert.deepEqual(slotAttemptDelays(12_000, () => 0), [1000, 2000, 3000, 4000]);
  // With the most jitter: 1.999 + 2.999 + 3.999 = 8.997 s; a fourth (4.999 s) would pass 12 s.
  assert.deepEqual(slotAttemptDelays(12_000, () => 0.999), [1999, 2999, 3999]);
});
