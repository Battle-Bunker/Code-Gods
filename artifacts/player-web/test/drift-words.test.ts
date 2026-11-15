/** Parameter drift on the rule card (src/panes/drift-words.ts; the coordinator's call 18, W3 #723), in a 12-year-old's words. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { driftNotice, driftWords } from "../src/panes/drift-words.ts";

test("the card counts down to the next chance of new numbers; nothing when the room or the rule has no drift", () => {
  // "May": a redraw can land on the same numbers, and the server redraws only among calibrated ones (W3 drift.ts).
  assert.equal(driftWords(120, 0, 5), "Your rule may get new numbers in 2:00.");
  assert.equal(driftWords(120, 37, 5), "Your rule may get new numbers in 1:23.");
  assert.equal(driftWords(120, 239.5, 5), "Your rule may get new numbers in 0:01.");
  assert.equal(driftWords(0, 37, 5), null, "no drift");
  assert.equal(driftWords(120, null, 5), null, "no world time (planning, the end)");
  assert.equal(driftWords(120, 37, 1), null, "a rule with one set of numbers never changes: no countdown");
});

test("just after a change, the card says so and shows the new rule", () => {
  assert.equal(driftNotice({ drifts: 1, driftedAt: 120, card: "Make the area as close as possible to 9." }, 125),
    "Your rule's numbers just changed (5 s ago). Rules get new numbers now and then, so the best ones keep changing: your points now count by your new rule. Your rule now: Make the area as close as possible to 9.");
  assert.equal(driftNotice({ drifts: 1, driftedAt: 120, card: "x" }, 160), null, "after 30 s it is just your rule");
  assert.equal(driftNotice({ drifts: 0, driftedAt: null, card: "x" }, 10), null, "never changed");
});

test("a dilated game (W3 #729: times are game seconds) counts down and says \"ago\" in wall seconds", () => {
  // 120 game seconds at 4× is 30 wall seconds; 37 game seconds in, 83 game seconds (20.75 s) are left.
  assert.equal(driftWords(120, 37, 5, 4), "Your rule may get new numbers in 0:21.");
  const rule = { drifts: 1, driftedAt: 100, card: "x" };
  assert.equal(driftNotice(rule, 140, 4), "Your rule's numbers just changed (10 s ago). Rules get new numbers now and then, so the best ones keep changing: your points now count by your new rule. Your rule now: x");
  assert.equal(driftNotice(rule, 230, 4), null, "130 game seconds is 32.5 wall seconds: past the notice");
});

test("no countdown to a redraw at or after a fixed end (round 16: it counted to 10:00, the end)", () => {
  assert.equal(driftWords(120, 490, 5, 1, 600), null, "the next chance, 600, is the end");
  assert.equal(driftWords(120, 470, 5, 1, 600), "Your rule may get new numbers in 0:10.");
  assert.equal(driftWords(120, 490, 5, 1, null), "Your rule may get new numbers in 1:50.", "a hidden end: the countdown stays");
});
