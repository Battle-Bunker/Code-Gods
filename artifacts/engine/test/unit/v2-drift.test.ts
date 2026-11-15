/**
 * Parameter drift (convex/v2/drift.ts; the coordinator's trial, call 18): drift k falls due at world second k ×
 * driftSeconds; a seat's rule is redrawn from its parameter grid, the current value included (a two-value grid is no predictable
 * flip), with the same family and tie-breaker and precomputed values, the same for the same game, seat and drift.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dilate } from "@workspace/v2-economy";
import { driftEventsDue, nextDriftAt, redrawParams } from "../../convex/v2/drift.ts";
import { VALUE_INDEX as VALUE_RECORDS } from "../../convex/v2/values.gen.ts";

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

test("a redraw never seats a pair the line seating rule forbids (Prime Landing beside Whole Crossing on the same landings)", async () => {
  const { lineClashes } = await import("@workspace/v2-linear");
  // Both are ladder families now, never redrawn, so drift cannot make the forbidden pair; the seating filter in
  // redrawParams stays for bounded families (lib/v2-core driftParams' allowed filter is tested there).
  const wc = { family: "whole-crossing", params: { q: 5, r: 1 } };   // forbidden beside Prime Landing ending 1 (side 1) and 9 (side −1)
  for (let tick = 1; tick <= 30; tick++) {
    const drawn = redrawParams("line-q", "prime-landing", "shared-factor", { ends: 9 }, "seed", 1, tick, [wc]);
    assert.equal(drawn, null, `tick ${tick}`);
    assert.deepEqual(lineClashes([wc, { family: "prime-landing", params: { ends: 9 } }]), []);
  }
});

test("a ladder family is never redrawn (the coordinator's amendment of call 18): its seat keeps its dealt parameters", async () => {
  const { familyOf } = await import("../../convex/v2/deal.ts");
  for (const [family, tb, params] of [["prime-landing", "shared-factor", { ends: 1 }], ["prime-staircase", "shared-factor", { ends: 3 }], ["whole-crossing", "shared-factor", { q: 5, r: 2 }], ["smooth-intercept", "shared-factor", { primes: [3, 7] }], ["treasure", "shared-factor", { k: 3 }]] as const) {
    assert.equal(familyOf(family).keepsParams, true, family);
    for (let tick = 1; tick <= 12; tick++) assert.equal(redrawParams("line-q", family, tb, params, "seed", 1, tick), null, `${family} tick ${tick}`);
  }
  // A bounded family still drifts.
  assert.ok(Array.from({ length: 12 }, (_, t) => redrawParams("line-q", "same-on-both-rulers", "steep", { T: 6 }, "seed", 1, t + 1)).some(x => x !== null));
});

test("a pair rule is a ladder: drift never redraws its numbers (a redraw reset the climb; keepsParams)", () => {
  for (let tick = 1; tick <= 20; tick++) {
    assert.equal(redrawParams("pair-q", "right-angle", "corner-prime", { q: 5, r: 2 }, "seed", 1, tick), null);
    assert.equal(redrawParams("pair-q", "high-start", "start-echo", { q: 5, r: 1 }, "seed", 1, tick, [{ family: "whole-answer", params: { q: 7, r: 4 } }]), null);
  }
});
