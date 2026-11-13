/** The observer agent's template and its stated cost (src/core/panels/observer.ts; docs/energy-model.md §11.3). */
import test from "node:test";
import assert from "node:assert/strict";
import { observerRate, observerSource, rateText } from "../src/core/panels/observer.ts";

test("the observer reads the whole object of each type and returns no calls, in both languages", () => {
  assert.equal(observerSource("python", "Grid"), "def agent(grid):\n    # Only look: read all of it, change nothing.\n    repr(grid)\n    return []");
  assert.equal(observerSource("typescript", "Grid"), "function agent(grid) {\n  // Only look: read all of it, change nothing.\n  String(grid);\n  return [];\n}");
  assert.match(observerSource("python", "Int")!, /x\.value\n    return \[\]/);
  assert.match(observerSource("typescript", "string")!, /s\.text;/);
  assert.equal(observerSource("python", "Tree"), null, "an unknown type has no template");
  assert.equal(observerSource("haskell", "Grid"), null);
});

test("its cost: the whole read plus the offer per turn; a 10% share of 64 bits/s on the beginner board covers about 3.5 objects a second", () => {
  const beginner = { fullRead: 1.660964, objects: 10, changeReadRatio: 32, powerPerSecond: 64 };
  const r = observerRate({ ...beginner, share: 0.1 });
  assert.ok(Math.abs(r.perTurn - (1.660964 + Math.log2(10) / 32)) < 1e-12);
  assert.ok(Math.abs(r.perSecond - 6.4 / r.perTurn) < 1e-12 && r.perSecond > 3.5 && r.perSecond < 3.7);
  assert.equal(rateText(r.perSecond), "refreshes about 3.6 objects a second");
  // The world's own turn rate bounds it, and no power means no watch.
  assert.equal(observerRate({ ...beginner, share: 1, turnsPerSecond: 25 }).perSecond, 25);
  assert.equal(rateText(observerRate({ ...beginner, share: 0 }).perSecond), "refreshes nothing: it has no power");
  assert.equal(rateText(0.25), "refreshes about one object every 4 seconds");
  assert.equal(rateText(12.4), "refreshes about 12 objects a second");
});
