/**
 * The verdict of a validation's dry run (convex/lib/dryRun.ts): an agent that fails on every sample object is
 * INVALID with the error it raised; one that never moves or mostly fails still validates, with a warning.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { dryRunVerdict } from "../../convex/lib/dryRun.ts";

test("an agent that raises on every sample object is invalid, and says the error first", () => {
  const v = dryRunVerdict({ invalidRate: 1, skipRate: 0, changeRate: 0, firstError: "NameError: name 'line' is not defined (line 2)" });
  assert.equal(v.valid, false);
  assert.equal(v.lead, "NameError: name 'line' is not defined (line 2)");
  assert.match(v.detail ?? "", /every sample object/);
  assert.deepEqual(v.warnings, []);
  // The sandbox's wrapper is dropped: the player reads the error itself.
  assert.equal(dryRunVerdict({ invalidRate: 1, firstError: "agent raised an error: NameError: name 'line' is not defined (line 2)" }).lead, "NameError: name 'line' is not defined (line 2)");
});

test("an agent that fails on every sample object with no recorded error is still invalid", () => {
  const v = dryRunVerdict({ invalidRate: 1, skipRate: 0, changeRate: 0 });
  assert.equal(v.valid, false);
  assert.match(v.lead ?? "", /failed on every sample object/);
});

test("an agent that makes no move on any sample object validates with a warning", () => {
  const v = dryRunVerdict({ invalidRate: 0, skipRate: 1, changeRate: 0 });
  assert.equal(v.valid, true);
  assert.deepEqual(v.warnings, ["This agent made no move on any sample object. It may do nothing."]);
});

test("an agent that fails on most sample objects validates with a warning that names the error", () => {
  const v = dryRunVerdict({ invalidRate: 0.6, skipRate: 0, changeRate: 0.4, firstError: "IndexError: list index out of range (line 3)" });
  assert.equal(v.valid, true);
  assert.deepEqual(v.warnings, ["It fails on 60% of sample objects: IndexError: list index out of range (line 3)"]);
});

test("a working agent has no dry-run findings; an older examination without rates is valid", () => {
  assert.deepEqual(dryRunVerdict({ invalidRate: 0.1, skipRate: 0.2, changeRate: 0.7 }), { valid: true, warnings: [] });
  assert.deepEqual(dryRunVerdict({}), { valid: true, warnings: [] });
});
