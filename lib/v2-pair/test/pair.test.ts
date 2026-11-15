import { test } from "node:test";
import assert from "node:assert/strict";
import { isInvalid } from "@workspace/v2-core";
import { lineBits, lineParams } from "@workspace/v2-linear";
import { canonicalPair, decodePair, encodePair, facts, pairQ, pairType } from "../src/index.ts";
import { L, sys } from "./helpers.ts";

test("a system is an unordered set: the same two lines either way round are one object", () => {
  const a = sys(L(2, 3, -12), L(1, -1, 1)), b = sys(L(1, -1, 1), L(2, 3, -12));
  assert.equal(encodePair(a), encodePair(b));
  assert.deepEqual(decodePair(encodePair(a)), a);
});

test("the two lines must differ; parallel lines are allowed", () => {
  assert.ok(isInvalid(canonicalPair([L(1, 1, 0), L(2, 2, 0)], pairQ)));
  assert.ok(!isInvalid(canonicalPair([L(1, 1, 0), L(1, 1, 5)], pairQ)));
  assert.equal(facts(sys(L(1, 1, 0), L(1, 1, 5))).P, null);
});

test("a wire string that is not canonical is refused", () => {
  assert.throws(() => decodePair("1,-1,1;2,3,-12"));
  assert.throws(() => decodePair("0,1,0;0,1,0"));
});

test("φ is the sum of the two lines' codes", () => {
  const s = sys(L(2, 3, -12), L(1, -1, 1));
  assert.equal(pairType.readLength(s, pairQ), s.lines.reduce((t, l) => t + lineBits(l, lineParams(pairQ)), 0));
});

test("the answer is Cramer's: 2x + 3y = 12 and x − y = 1 cross at (3, 2), dividing by −5", () => {
  const f = facts(sys(L(2, 3, -12), L(1, -1, -1)));
  assert.equal(f.D === 5n || f.D === -5n, true);
  assert.equal(`${f.P!.x.n}/${f.P!.x.d},${f.P!.y.n}/${f.P!.y.d}`, "3/1,2/1");
});

test("the steeper line: a vertical line is steepest", () => {
  const s = sys(L(1, 0, -3), L(-5, 1, 0));   // x = 3 and y = 5x
  assert.equal(s.lines[facts(s).s]!.b, 0n);
});
