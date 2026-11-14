import { test } from "node:test";
import assert from "node:assert/strict";
import { isInvalid } from "@workspace/v2-core";
import { describeLine, lineType, lineQ, lineZ, normalise } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

test("a line has one canonical triple: primitive, b > 0 (or b = 0 and a > 0)", () => {
  assert.deepEqual(normalise(4n, -2n, 6n), { a: -2n, b: 1n, c: -3n });
  assert.deepEqual(normalise(-3n, 0n, 6n), { a: 1n, b: 0n, c: -2n });
  assert.ok(isInvalid(normalise(0n, 0n, 1n)));
  // 2y = 4x + 2 and y = 2x + 1 are one state.
  assert.equal(lineType.encode(abc(-4, 2, -2)), lineType.encode(mc(2, 1)));
});

test("the Z board has whole-number lines only; the Q board has every rational line", () => {
  assert.ok(isInvalid(lineType.canonical(abc(1, 0, -3), lineZ)));          // x = 3
  assert.ok(isInvalid(lineType.canonical(abc(-1, 2, 0), lineZ)));          // y = x/2
  assert.ok(!isInvalid(lineType.canonical(abc(1, 0, -3), lineQ)));
  assert.ok(!isInvalid(lineType.canonical(mc(-3, 7), lineZ)));
});

test("wire round trip, read length and descriptions", () => {
  const s = mc(2, 1);
  assert.deepEqual(lineType.decode(lineType.encode(s)), s);
  assert.throws(() => lineType.decode("2,-1,1"));   // not sign-normalised
  assert.equal(lineType.readLength(mc(0, 0), lineZ), 2);  // int(0) + int(0)
  assert.equal(lineType.readLength(mc(1, 5), lineZ), 3 + 7);
  assert.equal(describeLine(mc(2, 1).lines[0]!), "y = 2x + 1");
  assert.equal(describeLine(abc(1, 0, -3).lines[0]!), "x = 3");
});

test("only the canonical wire form decodes", () => {
  for (const bad of ["1,,0", "1, 0,0", "1,0", "a,1,0", "2,1,0x1"]) assert.throws(() => lineType.decode(bad), bad);
});
