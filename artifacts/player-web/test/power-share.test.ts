import assert from "node:assert/strict";
import test from "node:test";
import { maxShareFor, parseSharePercent, shareProblem } from "../src/core/panels/power-share.ts";

test("a typed percentage becomes a share from 0 to 1; anything else is refused", () => {
  assert.equal(parseSharePercent("25"), 0.25);
  assert.equal(parseSharePercent(" 12.5% "), 0.125);
  assert.equal(parseSharePercent("0"), 0);
  assert.equal(parseSharePercent("100"), 1);
  for (const bad of ["", "abc", "-5", "101", "1e2", "5 5"]) assert.equal(parseSharePercent(bad), null, bad);
});

test("an agent can have at most what its siblings leave; the rest stays with the god", () => {
  assert.equal(maxShareFor(0.25, 0.75), 0.5, "its own 25% and the 25% nobody holds");
  assert.equal(maxShareFor(0, 1), 0);
  assert.equal(shareProblem("60", 0.25, 0.75), "You can give this agent at most 50%: your other agents hold the rest.");
  assert.equal(shareProblem("50", 0.25, 0.75), null);
  assert.match(shareProblem("lots", 0, 0) ?? "", /percentage/);
});
