/** Decision 24 at birth (convex/v2/world.ts): a game's starting objects are distinct draws of the seeded birth walk. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineZ } from "@workspace/v2-linear";
import { birthDraws, distinctBirths } from "../../convex/v2/world.ts";

test("starting births are distinct, in the walk's order, and skip only repeats", () => {
  for (const seed of ["a", "b", "c", "d"]) {
    const born = distinctBirths(lineZ.id, seed, 40);
    assert.equal(born.length, 40);
    assert.equal(new Set(born).size, 40, `no duplicate (${seed})`);
    const walk = birthDraws(lineZ.id, seed, 200);
    assert.deepEqual(born, [...new Set(walk)].slice(0, 40), "the first 40 distinct draws of the same walk");
  }
});

test("the seeded walk does repeat states, so the skip matters", () => {
  const walk = birthDraws(lineZ.id, "a", 200);
  assert.ok(new Set(walk).size < walk.length, "line-z births collide (Σπ² ≈ 0.07)");
});
