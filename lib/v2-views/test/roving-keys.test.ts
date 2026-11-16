/** v1's arrow keys between scoring units and between annotation modes (GoalBoard.tsx:202, modes.tsx:114), as one rule. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rovingIndex } from "../src/roving-keys.ts";

test("arrows step and stop at the ends, Home and End jump, other keys are not ours", () => {
  assert.equal(rovingIndex("ArrowDown", 0, 3), 1);
  assert.equal(rovingIndex("ArrowRight", 2, 3), 2, "stops at the end, as v1");
  assert.equal(rovingIndex("ArrowUp", 0, 3), 0);
  assert.equal(rovingIndex("ArrowLeft", 2, 3), 1);
  assert.equal(rovingIndex("Home", 2, 3), 0);
  assert.equal(rovingIndex("End", 0, 3), 2);
  assert.equal(rovingIndex("Enter", 0, 3), null);
  assert.equal(rovingIndex("ArrowDown", 0, 0), null, "nothing to move between");
});
