/** How a game ends (convex/v2/duration.ts; v1's durationMode): fixed at its length, or a hidden exponential lifetime. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawEnd, endWorldOf, halfLifeInterval90, lifetimeSeconds, MIN_LIFETIME_FRACTION, regularBirths } from "../../convex/v2/duration.ts";
import { presetOf } from "../../convex/v2/presets.ts";

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

test("regular births (decision 31): birth j at j / rate, so a beginner game of 600 s has exactly two, at 240 and 480 s", () => {
  const rate = 1 / 240, at: number[] = [];
  let world = 0;
  for (let tick = 0; world < 600; tick++) {   // the tick's uneven windows
    const next = Math.min(600, world + 1.3 + (tick % 4) * 0.4);
    for (let j = 0; j < regularBirths(rate, world, next); j++) at.push(next);
    world = next;
  }
  assert.equal(at.length, 2);
  assert.ok(at[0]! >= 240 && at[0]! < 242 && at[1]! >= 480 && at[1]! < 482, `${at}`);
  assert.equal(regularBirths(rate, 0, 239.9), 0);
  assert.equal(regularBirths(rate, 239.9, 960), 4, "a long window holds every birth scheduled in it");
  const beginner = presetOf("lines-beginner");
  assert.equal(beginner.startingObjects + regularBirths(beginner.economy.birthsPerSecond, 0, beginner.worldSeconds), 5, "it ends at 5");
  assert.equal(presetOf("grids-beginner").regularBirths, true);
  assert.notEqual(presetOf("lines-lenses").regularBirths, true, "the other presets keep v1's stochastic births");
});
