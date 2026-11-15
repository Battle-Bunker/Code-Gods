/** Grid seating clusters (seating.ts): what would break is a cluster pair passing, or one family clashing with itself. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridClash, gridClashes, GRID_BLOCKED_PAIRS, GRID_CLUSTERS, gridFamilies } from "../src/index.ts";

test("families in one cluster clash, a family clashes with itself, and every clustered family exists", () => {
  assert.equal(gridClash("magic-eighteen", "magic-accountant"), true);
  assert.equal(gridClash("mirrormancer", "leapfrog"), true);
  assert.equal(gridClash("uphill", "staircase"), true);
  assert.equal(gridClash("magic-eighteen", "mirrormancer"), false);
  assert.equal(gridClash("crosswise-threes", "fillomino"), false);
  assert.equal(gridClash("staircase", "opposite-nines"), true, "blocked: an optimum was found for the pair");
  assert.equal(gridClash("opposite-nines", "uphill"), false);
  assert.equal(gridClash("strangers", "strangers"), true, "two rules of one family share their main part");
  assert.deepEqual(gridClashes(["magic-eighteen", "crosswise-threes", "opposite-nines", "two-pair"]), ["magic-eighteen × opposite-nines"]);
  const ids = new Set(gridFamilies(4).map(f => f.id));
  for (const c of [...GRID_CLUSTERS, ...GRID_BLOCKED_PAIRS]) for (const f of c) assert.ok(ids.has(f), f);
});
