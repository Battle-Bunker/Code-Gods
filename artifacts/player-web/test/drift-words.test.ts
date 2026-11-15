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
    "Your rule's numbers just changed (5 s ago). Your rule now: Make the area as close as possible to 9.");
  assert.equal(driftNotice({ drifts: 1, driftedAt: 120, card: "x" }, 160), null, "after 30 s it is just your rule");
  assert.equal(driftNotice({ drifts: 0, driftedAt: null, card: "x" }, 10), null, "never changed");
});
