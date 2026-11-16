import test from "node:test";
import assert from "node:assert/strict";
import { safeModeOf } from "../src/core/safe-mode.ts";
import { carriedSearch } from "../src/core/routes.ts";

test("?panels=off is safe mode, and only that", () => {
  assert.equal(safeModeOf("?panels=off"), true);
  assert.equal(safeModeOf("?replay&panels=off"), true);
  assert.equal(safeModeOf(""), false);
  assert.equal(safeModeOf("?panels=on"), false);
  assert.equal(safeModeOf("?panels"), false);
});

test("safe mode is carried across navigation", () => {
  assert.equal(carriedSearch("?panels=off&replay"), "?panels=off");
});
