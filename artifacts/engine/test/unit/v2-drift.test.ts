/**
 * Parameter drift (convex/v2/drift.ts; the coordinator's trial, call 18): drift k falls due at world second k ×
 * driftSeconds; a seat's rule is redrawn to another parameter value of its grid (same family and tie-breaker, with
 * precomputed values), the same for the same game, seat and drift, and not at all without another value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "@workspace/v2-core";
import { dilate } from "@workspace/v2-economy";
import { driftDue, redrawParams } from "../../convex/v2/drift.ts";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";

test("drift k is due at k × the interval, once; an interval of 0 never drifts; dilation divides it", () => {
  assert.equal(driftDue(120, 119.9, 0), null);
  assert.equal(driftDue(120, 120, 0), 1);
  assert.equal(driftDue(120, 125, 1), null, "done once");
  assert.equal(driftDue(120, 365, 1), 3, "a late tick catches up to the latest drift");
  assert.equal(driftDue(0, 1e6, 0), null);
  assert.equal(dilate({ driftSeconds: 120 }, 10).driftSeconds, 12);
});

test("a redraw keeps the family and tie-breaker, changes the parameters, has values, and replays", () => {
  const grids = new Map<string, typeof VALUE_RECORDS[number][]>();
  for (const r of VALUE_RECORDS) grids.set(`${r.variant}|${r.family}|${r.tieBreaker}`, [...(grids.get(`${r.variant}|${r.family}|${r.tieBreaker}`) ?? []), r]);
  const grid = [...grids.values()].find(g => g.length >= 3)!;
  assert.ok(grid, "some family has a parameter grid");
  const r = grid[0]!, tb = r.tieBreaker === "none" ? null : r.tieBreaker;
  const seen = new Set<string>();
  for (let tick = 1; tick <= 40; tick++) {
    const next = redrawParams(r.variant, r.family, tb, r.params, "seed", 2, tick)!;
    assert.notEqual(canonicalJson(next.params), canonicalJson(r.params), "the parameters change");
    const rec = VALUE_RECORDS.find(x => x.ruleKey === next.ruleKey)!;
    assert.deepEqual([rec.family, rec.tieBreaker, rec.variant], [r.family, r.tieBreaker, r.variant], "never the family, lens or tie-breaker");
    assert.deepEqual(redrawParams(r.variant, r.family, tb, r.params, "seed", 2, tick), next, "the record replays it");
    seen.add(next.ruleKey);
  }
  assert.ok(seen.size >= 2, "different drifts draw different values");
  assert.equal(redrawParams(r.variant, "no-such-family", null, {}, "seed", 0, 1), null, "no grid: no drift");
});
