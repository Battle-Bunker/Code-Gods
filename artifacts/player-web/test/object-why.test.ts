/** The Objects panel's "why?" (src/core/panels/object-why.ts). What would break: "why?" opening an empty gap, or a heading that changes under the finger as the list re-ranks. */
import test from "node:test";
import assert from "node:assert/strict";
import { rankNote, whyTitle, whyUnavailable } from "../src/core/panels/object-why.ts";

test("why? always says something: the breakdown's heading, or why there is none", () => {
  // The heading names the grid stably (the list re-ranks, so "#1" became "#4", "#9" while it was read); the rank is a small note.
  assert.equal(whyTitle(301.54, "grid"), "Why this grid gives you 301.5 points");
  assert.equal(whyTitle(-12, "grid"), "Why this grid takes 12 points from you");
  assert.equal(whyTitle(-0.04, "grid"), "Why this grid gives you no points", "a loss that shows as 0 is no points, never 'takes 0 points from you'");
  assert.equal(whyTitle(0.04, "object"), "Why this object gives you no points");
  assert.equal(rankNote(4), "now #4 by points");
  assert.equal(rankNote(null), null);
  assert.equal(rankNote(undefined), null, "the rank is still loading");
  assert.equal(whyUnavailable({ id: "o1" }, "grid"), null);
  assert.equal(whyUnavailable(undefined, "grid"), "Loading this grid's points…");
  assert.equal(whyUnavailable(null, "grid"), "There is nothing to explain for this grid now: it is no longer in the world, so it gives nobody points.");
});
