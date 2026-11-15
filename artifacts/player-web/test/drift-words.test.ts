import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDriftAt } from "@workspace/v2-core";
import { driftNotice, driftWords, targetChange } from "../src/panes/drift-words.ts";

test("the countdown is to the seat's OWN next redraw (W3 #745: staggered); nothing when none is left", () => {
  // Three seats at 120 s: seat 1 at 40, 160…; seat 2 at 80, 200…; seat 0 at 120, 240….
  assert.equal(driftWords(nextDriftAt(120, 3, 1, 37, null), 37, 5), "Your rule may get new numbers in 0:03.");
  assert.equal(driftWords(nextDriftAt(120, 3, 2, 37, null), 37, 5), "Your rule may get new numbers in 0:43.");
  assert.equal(driftWords(nextDriftAt(120, 3, 0, 37, null), 37, 5), "Your rule may get new numbers in 1:23.");
  // A fixed 10-minute game: no redraw in its last 90 s, so seat 0's 600 never comes.
  assert.equal(driftWords(nextDriftAt(120, 3, 0, 490, 600), 490, 5), null, "no redraw left before the end");
  assert.equal(driftWords(null, 37, 5), null, "no drift in this room");
  assert.equal(driftWords(40, null, 5), null, "no world time (planning, the end)");
  assert.equal(driftWords(40, 37, 1), null, "a rule with one set of numbers never changes: no countdown");
  // A dilated game (W3 #729): game seconds ÷ timeScale on the wall: 83 game seconds at 4× is 21 s.
  assert.equal(driftWords(120, 37, 5, 4), "Your rule may get new numbers in 0:21.");
});

test("what changed: the one number that moved, else nothing to name", () => {
  assert.deepEqual(targetChange({ T: "-37" }, { T: "37" }), { from: "−37", to: "37" });
  assert.deepEqual(targetChange({ A: 4 }, { A: 9 }), { from: "4", to: "9" });
  assert.equal(targetChange({ T: "-37", k: 2 }, { T: "37", k: 3 }), null, "two numbers moved");
  assert.equal(targetChange(undefined, { T: "37" }), null, "the old numbers are not known (a reload)");
});

test("just after a change: what happened and what it means, in one place, then the new rule", () => {
  const rule = { drifts: 1, driftedAt: 120, card: "Make y(2) as close as possible to 37." };
  assert.equal(driftNotice(rule, 125, { from: "−37", to: "37" }),
    "Your rule's target changed from −37 to 37 (5 s ago). Your points are now counted by the new rule, so they may drop for a while; your agents now climb toward it. Your rule now: Make y(2) as close as possible to 37.");
  assert.equal(driftNotice(rule, 125, null),
    "Your rule's numbers just changed (5 s ago). Your points are now counted by the new rule, so they may drop for a while; your agents now climb toward it. Your rule now: Make y(2) as close as possible to 37.");
  assert.equal(driftNotice(rule, 160, null), null, "after 30 s it is just your rule");
  assert.equal(driftNotice({ drifts: 0, driftedAt: null, card: "x" }, 10, null), null, "never changed");
  assert.match(driftNotice({ drifts: 1, driftedAt: 100, card: "x" }, 140, null, 4)!, /\(10 s ago\)/, "wall seconds at 4×");
});
