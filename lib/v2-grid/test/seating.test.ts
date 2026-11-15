/** Grid seating clusters (seating.ts): what would break is a cluster pair passing, or one family clashing with itself. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridAligned, gridAlignedPairs, gridClash, gridClashes, gridSeatingCost, GRID_BLOCKED_PAIRS, GRID_CLUSTERS, gridFamilies } from "../src/index.ts";

test("forbidden pairs: one family twice, the same main part, big digits against small digits, a blocked pair", () => {
  assert.equal(gridClash("strangers", "strangers"), true, "two rules of one family share their main part");
  assert.equal(gridClash("magic-eighteen", "magic-accountant"), true, "the same main part on rows of 18");
  assert.equal(gridClash("magic-eighteen", "mirrormancer"), true, "big digits against small digits");
  assert.equal(gridClash("staircase", "opposite-nines"), true, "blocked: an optimum was found for the pair");
  assert.equal(gridClash("magic-eighteen", "opposite-nines"), false, "aligned, not forbidden");
  assert.equal(gridClash("crosswise-threes", "fillomino"), false);
  assert.deepEqual(gridClashes(["magic-eighteen", "crosswise-threes", "two-pair"]), ["magic-eighteen × two-pair"]);
  const ids = new Set(gridFamilies(4).map(f => f.id));
  for (const c of [...GRID_CLUSTERS, ...GRID_BLOCKED_PAIRS]) for (const f of c) assert.ok(ids.has(f), f);
});

test("aligned pairs: two families of one cluster, allowed but costed after the forbidden ones", () => {
  assert.equal(gridAligned("mirrormancer", "leapfrog"), true);
  assert.equal(gridAligned("uphill", "staircase"), true);
  assert.equal(gridAligned("magic-eighteen", "magic-accountant"), false, "forbidden, not merely aligned");
  assert.equal(gridAligned("crosswise-threes", "leapfrog"), false);
  assert.deepEqual(gridAlignedPairs(["mirrormancer", "crosswise-threes", "leapfrog"]), ["mirrormancer × leapfrog"]);
  assert.equal(gridSeatingCost(["mirrormancer", "crosswise-threes", "leapfrog"]), 1);
  assert.equal(gridSeatingCost(["magic-eighteen", "crosswise-threes", "two-pair"]), 1000);
  assert.equal(gridSeatingCost(["kings-and-subjects", "crosswise-threes", "fillomino"]), 0);
});
