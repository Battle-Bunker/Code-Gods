/** How a game ends (convex/v2/duration.ts; v1's durationMode): fixed at its length, or a hidden exponential lifetime. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawEnd, endWorldOf, halfLifeInterval90, lifetimeSeconds } from "../../convex/v2/duration.ts";

test("a fixed game ends at its length and draws nothing", () => {
  assert.equal(drawEnd("fixed", 300, () => { throw new Error("no draw"); }), 300);
  assert.equal(endWorldOf({ settings: { worldSeconds: 300 } }), 300, "a game stored without a drawn end ends at its length");
});

test("a halfLife game's end is an exponential lifetime: half of games end within the half-life", () => {
  assert.ok(Math.abs(lifetimeSeconds(300, 0.5) - 300) < 1e-9, "the median draw is the half-life");
  const draws = Array.from({ length: 20_000 }, () => drawEnd("halfLife", 300));
  const within = draws.filter(d => d <= 300).length / draws.length;
  assert.ok(Math.abs(within - 0.5) < 0.02, `${within} of games end within the half-life`);
  const { lo, hi } = halfLifeInterval90(300);
  const inside = draws.filter(d => d >= lo && d <= hi).length / draws.length;
  assert.ok(Math.abs(inside - 0.9) < 0.02, `the 90% interval holds ${inside}`);
  assert.ok(Math.abs(lo / 300 - 0.074) < 0.001 && Math.abs(hi / 300 - 4.32) < 0.01);
});
