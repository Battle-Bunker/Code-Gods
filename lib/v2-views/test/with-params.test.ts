import { test } from "node:test";
import assert from "node:assert/strict";
import { withParams } from "../src/contributors.ts";

test("a title's symbols take their values", () => {
  assert.equal(withParams("y(k) close to t", { k: 2, t: 37 }), "y(2) close to 37");
});

test("a worded parameter never replaces the same English word", () => {
  const title = "where the line meets y = x or y = −x, on as big a number reading the same backwards as possible";
  assert.equal(withParams(title, { meets: -1, digits: "odd" }), title);
});
