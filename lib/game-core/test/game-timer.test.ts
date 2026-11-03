import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceWorld, formatClock, gameEndSeconds, gameTimer, halfLifeInterval90 } from "../src/index.ts";

test("the 90% interval is [τ·ln(1/0.95), τ·ln(1/0.05)] ≈ [0.074h, 4.32h] and matches the engine's draw exactly", () => {
  const { lo, hi } = halfLifeInterval90(100);
  assert.ok(Math.abs(lo - 7.4) < 0.05 && Math.abs(hi - 432.2) < 0.1);
  // The engine's draw at U=0.95 / U=0.05 lands on the bounds: the interval is that mechanism's central 90%.
  assert.ok(Math.abs(gameEndSeconds("halfLife", 100, () => 0.95) - lo) < 1e-9);
  assert.ok(Math.abs(gameEndSeconds("halfLife", 100, () => 0.05) - hi) < 1e-9);
});

test("world time runs on only while the world runs", () => {
  assert.equal(advanceWorld(10, 1000, 4000, true), 13);
  assert.equal(advanceWorld(10, 1000, 4000, false), 10);
  assert.equal(advanceWorld(10, 5000, 4000, true), 10);
});

const base = { nowMs: 1_700_000_000_000 };
test("fixed games count down the exact remaining world time and hold while paused", () => {
  assert.deepEqual(gameTimer({ ...base, phase: "running", durationMode: "fixed", lengthSeconds: 600, world: 100 }), { kind: "fixed", seconds: 500, paused: false });
  assert.deepEqual(gameTimer({ ...base, phase: "paused", durationMode: "fixed", lengthSeconds: 600, world: 100 }), { kind: "fixed", seconds: 500, paused: true });
  assert.equal((gameTimer({ ...base, phase: "running", durationMode: "fixed", lengthSeconds: 600, world: 700 }) as { seconds: number }).seconds, 0);
});

test("half-life games show a static interval that ignores elapsed time", () => {
  const a = gameTimer({ ...base, phase: "running", durationMode: "halfLife", lengthSeconds: 300, world: 0 });
  const b = gameTimer({ ...base, phase: "running", durationMode: "halfLife", lengthSeconds: 300, world: 5000 });
  assert.deepEqual(a, b);
  assert.equal(a?.kind, "halfLife");
});

test("planning counts down to the world start, then holds", () => {
  assert.deepEqual(gameTimer({ ...base, phase: "planning", world: 0, planningEndsAt: base.nowMs + 169_000 }), { kind: "planning", seconds: 169, held: false });
  assert.deepEqual(gameTimer({ ...base, phase: "planning", world: 0, planningEndsAt: base.nowMs - 1 }), { kind: "planning", seconds: 0, held: true });
  assert.equal(gameTimer({ ...base, phase: "running", world: 0 }), null);
});

test("clock format: m:ss, h:mm:ss, rounding up when counting down", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(59.2), "1:00");
  assert.equal(formatClock(3600), "1:00:00");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(22.2, "down"), "0:22");
});
