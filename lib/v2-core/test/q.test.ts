import { test } from "node:test";
import assert from "node:assert/strict";
import * as Q from "../src/q.ts";

test("rationals stay in lowest terms with a positive denominator", () => {
  assert.deepEqual(Q.q(4, -6), { n: -2n, d: 3n });
  assert.equal(Q.toWire(Q.add(Q.q(1, 2), Q.q(1, 3))), "5/6");
  assert.equal(Q.toWire(Q.sub(Q.q(1, 2), Q.q(1, 2))), "0");
  assert.equal(Q.toWire(Q.div(Q.q(3), Q.q(-6))), "-1/2");
  assert.throws(() => Q.div(Q.ONE, Q.ZERO));
});

test("floor and ceil of negatives, comparison, the wire form", () => {
  assert.equal(Q.floor(Q.q(-7, 2)), -4n);
  assert.equal(Q.ceil(Q.q(-7, 2)), -3n);
  assert.equal(Q.floor(Q.q(7, 2)), 3n);
  assert.equal(Q.floor(Q.q(-4)), -4n);
  assert.equal(Q.cmp(Q.q(1, 3), Q.q(1, 2)), -1);
  assert.deepEqual(Q.parse("-10/4"), { n: -5n, d: 2n });
  assert.throws(() => Q.parse("1.5"));
  assert.deepEqual(Q.from(3), Q.q(3));
});
