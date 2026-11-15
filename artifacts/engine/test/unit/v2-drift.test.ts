/**
 * Parameter drift (convex/v2/drift.ts; the coordinator's trial, call 18): drift k falls due at world second k ×
 * driftSeconds; a seat's rule is redrawn from its parameter grid, the current value included (a two-value grid is no predictable
 * flip), with the same family and tie-breaker and precomputed values, the same for the same game, seat and drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dilate } from "@workspace/v2-economy";
import { driftEventsDue, nextDriftAt, redrawParams } from "../../convex/v2/drift.ts";
import { VALUE_RECORDS } from "../../convex/v2/values.gen.ts";

test("staggered: seat k of n is redrawn at k × interval / n, each seat every interval; dilation divides it", () => {
  // Three seats at 120 s: one seat every 40 s (seats 1, 2, then 0), each seat every 120 s.
  const due = driftEventsDue(120, 3, 245, 0, null);
  assert.deepEqual(due.map(d => [d.e * 40, d.seat]), [[40, 1], [80, 2], [120, 0], [160, 1], [200, 2], [240, 0]]);
  assert.deepEqual(driftEventsDue(120, 3, 245, 6, null), [], "each event once");
  assert.deepEqual(driftEventsDue(120, 3, 165, 3, null).map(d => d.e), [4], "a late tick catches up");
  assert.deepEqual(driftEventsDue(0, 3, 1e6, 0, null), []);
  for (const seat of [0, 1, 2]) for (const world of [0, 39.9, 40, 119, 121, 300]) {
    const next = nextDriftAt(120, 3, seat, world, null)!;
    const first = driftEventsDue(120, 3, next, 0, null).filter(d => d.seat === seat && d.e * 40 > world + 1e-9)[0]!;
    assert.ok(Math.abs(first.e * 40 - next) < 1e-9, `seat ${seat} after ${world}: next ${next}`);
  }
  assert.equal(dilate({ driftSeconds: 120 }, 10).driftSeconds, 12);
});

test("no redraw in the last 90 game seconds of a fixed-length game (playtest round 16: one at the buzzer)", () => {
  const due = driftEventsDue(120, 3, 600, 0, 600);
  assert.ok(due.filter(d => !d.skip).every(d => d.e * 40 <= 510), "none run after 510 s");
  assert.deepEqual(due.filter(d => d.skip).map(d => d.e * 40), [520, 560, 600], "the last ones are passed over, counted");
  assert.equal(nextDriftAt(120, 3, 0, 500, 600), null, "the countdown says none is left");
  assert.equal(nextDriftAt(120, 3, 2, 400, 600), 440);
  assert.equal(driftEventsDue(120, 3, 600, 0, null).filter(d => d.skip).length, 0, "a hidden end guards nothing");
});

test("a redraw keeps the family and tie-breaker, may keep or change the parameters, has values, and replays", () => {
  const grids = new Map<string, typeof VALUE_RECORDS[number][]>();
  for (const r of VALUE_RECORDS) grids.set(`${r.variant}|${r.family}|${r.tieBreaker}`, [...(grids.get(`${r.variant}|${r.family}|${r.tieBreaker}`) ?? []), r]);
  const grid = [...grids.values()].find(g => g.length >= 3)!;
  assert.ok(grid, "some family has a parameter grid");
  const r = grid[0]!, tb = r.tieBreaker === "none" ? null : r.tieBreaker;
  const seen = new Set<string>();
  for (let tick = 1; tick <= 40; tick++) {
    const drawn = redrawParams(r.variant, r.family, tb, r.params, "seed", 2, tick);
    const next = drawn ?? { ruleKey: r.ruleKey, params: r.params };   // null: the value kept
    const rec = VALUE_RECORDS.find(x => x.ruleKey === next.ruleKey)!;
    assert.deepEqual([rec.family, rec.tieBreaker, rec.variant], [r.family, r.tieBreaker, r.variant], "never the family, lens or tie-breaker");
    assert.deepEqual(redrawParams(r.variant, r.family, tb, r.params, "seed", 2, tick), drawn, "the record replays it");
    seen.add(next.ruleKey);
  }
  assert.ok(seen.size >= 2, "different drifts draw different values");
  assert.ok(seen.has(r.ruleKey), "a redraw may keep the current value");
  assert.equal(redrawParams(r.variant, "no-such-family", null, {}, "seed", 0, 1), null, "no grid: no drift");
});
