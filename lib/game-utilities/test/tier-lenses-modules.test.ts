/**
 * The tier-lens modules load in either order. `tier-lenses.ts` builds `TIER_LENSES` at module evaluation by spreading
 * `MORE_TIER_LENSES` from `tier-lenses-more.ts`, so if that module imported anything from `tier-lenses.ts` at runtime,
 * a graph that reached it first would throw "Cannot access 'MORE_TIER_LENSES' before initialization" — and which graph
 * that is depends on one import line somewhere else. The shared `heatOf` therefore lives in `explain/heat.ts`.
 *
 * The import order below is the point of the file: more first, then the module that spreads it.
 */
import { MORE_TIER_LENSES } from "../src/explain/tier-lenses-more.ts";
import { TIER_LENSES } from "../src/explain/tier-lenses.ts";
import { test } from "node:test";
import assert from "node:assert/strict";

test("tier-lenses-more loads before tier-lenses, and the registry holds every lens of both", () => {
  assert.deepEqual(Object.keys(MORE_TIER_LENSES).sort(), ["equalRoads", "linkSums", "links", "linksVia"].sort());
  for (const id of Object.keys(MORE_TIER_LENSES)) assert.ok(TIER_LENSES[id], `${id} is in the registry`);
  assert.deepEqual(Object.keys(TIER_LENSES).sort(),
    ["equalRoads", "halves", "holding", "lines", "linkSums", "links", "linksVia", "pairs", "sameRoads", "squares"]);
  for (const [id, lens] of Object.entries(TIER_LENSES)) {
    assert.equal(typeof lens.parts, "function", id);
    assert.ok(lens.unit[0] && lens.unit[1], id);
  }
});
