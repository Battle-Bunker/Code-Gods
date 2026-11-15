/**
 * The dealt rule's worth in bits (src/sdk/rule.ts, owner decision 23): the server's value function's knots read by
 * valueLookup.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { valueOf } from "../src/sdk/rule.ts";

test("bits at a knot, halfway between two, and none without knots", () => {
  const v = valueOf([{ u: null, bits: 0, lo: 0, hi: 0 }, { u: ["1"], bits: 2, lo: 1.5, hi: 2.5 }, { u: ["3"], bits: 6, lo: 5, hi: 7 }], { primary: { form: "linear", slope: 2 }, secondary: { form: "log", slope: 1 } })!;
  assert.equal(v(null).bits, 0);
  assert.equal(v([{ n: 1n, d: 1n }] as never).bits, 2);
  assert.equal(v([{ n: 2n, d: 1n }] as never).bits, 4, "between two knots: their mean");
  assert.equal(v([{ n: 5n, d: 1n }] as never).bits, 10, "past the best knot the tail keeps rising: 2 bits a unit");
  // Without a tail (the gallery's points) the lookup fits one from the knots: still rising, never flat.
  const bare = valueOf([{ u: null, bits: 0 }, { u: ["1"], bits: 2 }, { u: ["3"], bits: 6 }])!;
  assert.ok(bare([{ n: 100n, d: 1n }] as never).bits > 6);
  assert.equal(valueOf([], undefined), null);
});

test("knots without bounds (the gallery's points) read as exact", () => {
  const v = valueOf([{ u: null, bits: 0 }, { u: ["1"], bits: 2 }])!;
  assert.deepEqual(v([{ n: 1n, d: 1n }] as never), { bits: 2, lo: 2, hi: 2, at: "knot" });
});
