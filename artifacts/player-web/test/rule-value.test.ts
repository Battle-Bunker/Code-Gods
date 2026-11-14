/**
 * The dealt rule's worth in bits (src/sdk/rule.ts, owner decision 23): the server's value function's knots read by
 * valueLookup.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { valueOf } from "../src/sdk/rule.ts";

test("bits at a knot, halfway between two, and none without knots", () => {
  const v = valueOf([{ u: null, bits: 0, lo: 0, hi: 0 }, { u: ["1"], bits: 2, lo: 1.5, hi: 2.5 }, { u: ["3"], bits: 6, lo: 5, hi: 7 }], { primary: 0, secondary: 0 })!;
  assert.equal(v(null).bits, 0);
  assert.equal(v([{ n: 1n, d: 1n }] as never).bits, 2);
  assert.equal(v([{ n: 2n, d: 1n }] as never).bits, 4, "between two knots: their mean");
  assert.equal(valueOf([], undefined), null);
});

test("knots without bounds (the gallery's points) read as exact", () => {
  const v = valueOf([{ u: null, bits: 0 }, { u: ["1"], bits: 2 }])!;
  assert.deepEqual(v([{ n: 1n, d: 1n }] as never), { bits: 2, lo: 2, hi: 2, at: "knot" });
});
