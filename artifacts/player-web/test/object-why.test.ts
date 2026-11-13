/** The Objects panel's "why?" (src/core/panels/object-why.ts). What would break: "why?" opening an empty gap, or a heading that names the wrong figure. */
import test from "node:test";
import assert from "node:assert/strict";
import { whyTitle, whyUnavailable } from "../src/core/panels/object-why.ts";

test("why? always says something: the breakdown's heading, or why there is none", () => {
  assert.equal(whyTitle(1, 301.54, "grid"), "Why #1 gives you 301.5 points");
  assert.equal(whyTitle(7, -12, "grid"), "Why #7 takes 12 points from you");
  assert.equal(whyTitle(null, 0, "grid"), "Why this grid gives you 0 points", "the rank is still loading");
  assert.equal(whyUnavailable({ id: "o1" }, "grid"), null);
  assert.equal(whyUnavailable(undefined, "grid"), "Loading this grid's points…");
  assert.equal(whyUnavailable(null, "grid"), "There is nothing to explain for this grid now: it is no longer in the world, so it gives nobody points.");
});
