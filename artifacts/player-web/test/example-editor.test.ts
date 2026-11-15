import { test } from "node:test";
import assert from "node:assert/strict";
import { lineType, lineZ } from "@workspace/v2-linear";
import { gridType, grid4 } from "@workspace/v2-grid";
import { lineFromInputs, stateFromWire } from "../src/panes/example-edit.ts";

test("a line from its gradient and intercept, as a person writes them", () => {
  const s = lineFromInputs("-2", "7");
  assert.equal(lineType.encode(s), lineType.encode(lineFromInputs("−2", "7")), "a typographic minus too");
  assert.equal(lineFromInputs("x", "1"), null);
});

test("a grid from its rows; nonsense is refused, never a broken board", () => {
  const g = stateFromWire(gridType, grid4, "1234/0000/0000/0000");
  assert.ok(g);
  assert.equal(gridType.encode(g!), "1234/0000/0000/0000");
  assert.equal(stateFromWire(gridType, grid4, "12/34"), null);
});
