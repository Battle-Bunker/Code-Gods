import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceBits, gammaBits, intBits } from "../src/codes.ts";

test("program text codes: gamma, its signed zigzag, and a uniform choice", () => {
  assert.deepEqual([1n, 2n, 3n, 4n, 7n, 8n].map(gammaBits), [1, 3, 3, 5, 5, 7]);
  assert.deepEqual([0n, 1n, -1n, 2n, -2n].map(intBits), [1, 3, 3, 5, 5]);
  assert.equal(choiceBits(8), 3);
});
