/** How a game ends (convex/v2/duration.ts; v1's durationMode): fixed at its length, or a hidden exponential lifetime. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawEnd, endWorldOf, halfLifeInterval90, lifetimeSeconds, MIN_LIFETIME_FRACTION } from "../../convex/v2/duration.ts";

test("a fixed game ends at its length and draws nothing", () => {
  assert.equal(drawEnd("fixed", 300, () => { throw new Error("no draw"); }), 300);
  assert.equal(endWorldOf({ settings: { worldSeconds: 300 } }), 300, "a game stored without a drawn end ends at its length");
});

test("a halfLife game's end is an exponential lifetime past a floor of h/10 (the coordinator's trial): never sooner", () => {
  assert.ok(Math.abs(lifetimeSeconds(300, 0.5) - 300) < 1e-9, "the exponential's median is the half-life");
  const draws = Array.from({ length: 20_000 }, () => drawEnd("halfLife", 300));
  assert.ok(Math.min(...draws) >= MIN_LIFETIME_FRACTION * 300, `none ends before 30 s: ${Math.min(...draws)}`);
  // Past the floor it is v1's exponential: half of games end within h of the floor.
  const within = draws.filter(d => d <= 30 + 300).length / draws.length;
  assert.ok(Math.abs(within - 0.5) < 0.02, `${within} of games end within the half-life after the floor`);
  const { lo, hi } = halfLifeInterval90(300);
  const inside = draws.filter(d => d >= lo && d <= hi).length / draws.length;
  assert.ok(Math.abs(inside - 0.9) < 0.02, `the 90% interval holds ${inside}`);
  assert.ok(Math.abs(lo / 300 - 0.174) < 0.001 && Math.abs(hi / 300 - 4.42) < 0.01, `${lo / 300}, ${hi / 300}`);
});
