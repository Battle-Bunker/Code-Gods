/**
 * Line turnover's pure part (convex/v2/turnover.ts; docs/engine-v2/retirement-design.md).
 *
 * What would break: a stored game's replay (draws that change when nothing retires); a live count past the cap; a
 * line other than the oldest retiring; a tick offering a line its own births retire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { liveLines, offerable, pickLine, retiringCount } from "../../convex/v2/turnover.ts";
import { valueObjects as valueObjectsUnder } from "../../convex/v2/world.ts";

test("with no turnover every line is live, and the offers are exactly the draws before turnover existed", () => {
  assert.deepEqual(liveLines({ objects: 4 }), [1, 2, 3, 4]);
  const a = rng("seed", "tick", 7), b = rng("seed", "tick", 7), live = offerable(liveLines({ objects: 5 }), 2, null);
  for (let i = 0; i < 200; i++) assert.equal(pickLine(live, a), 1 + b.below(5));
});

test("a birth that would pass the cap retires the oldest live line first; the count never passes the cap", () => {
  // Hand-derived: 3 live at cap 3, two births: each birth first retires the oldest, so 2 retire.
  assert.equal(retiringCount(3, 2, 3), 2);
  // Under the cap: nothing retires until it is reached (2 live, cap 3, two births: the second retires one).
  assert.equal(retiringCount(2, 2, 3), 1);
  assert.equal(retiringCount(2, 0, 3), 0);
  // More births than the cap: every live line retires (the commit's own newborns too, not counted here).
  assert.equal(retiringCount(1, 3, 1), 1);
  assert.equal(retiringCount(5, 4, null), 0);
});

test("a tick offers only the live lines its births will not retire", () => {
  assert.deepEqual(offerable([3, 4, 5], 1, 3), [4, 5]);
  assert.deepEqual(offerable([3, 4, 5], 0, 3), [3, 4, 5]);
  assert.deepEqual(offerable([1, 2], 1, 3), [1, 2]);
});

test("the uniqueness correction counts the cap when retired lines release their states, else the game's births", () => {
  const settings = { startingObjects: 3, worldSeconds: 600, economy: { birthsPerSecond: 1 / 30 } };
  assert.equal(valueObjectsUnder(settings), 13);
  assert.equal(valueObjectsUnder({ ...settings, turnover: { liveCap: 5, retiredPoints: "banked", retiredHolds: true } }), 13);
  assert.equal(valueObjectsUnder({ ...settings, turnover: { liveCap: 5, retiredPoints: "banked", retiredHolds: false } }), 5);
});
