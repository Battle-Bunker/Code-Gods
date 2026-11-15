/** The collapse check's landscape (scripts/landscape-lib.ts): a rule's bits are its own parameters' value function. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { poolOf, spaceOf } from "../scripts/landscape-lib.ts";

test("space.bits keeps two numbers of one family and tie-breaker apart", () => {
  const space = spaceOf("pair-q"), rules = poolOf("pair-q").rules;
  const fc = rules.filter(r => r.family === "far-crossing" && r.tieBreaker === "far-gap");
  const a = fc.find(r => JSON.stringify(r.params) === '{"q":11,"r":3}')!, b = fc.find(r => JSON.stringify(r.params) === '{"q":11,"r":5}')!;
  // x = 82 leaves 5 when divided by 11: on Far Crossing {11, 5}'s ladder, off {11, 3}'s.
  const s = space.state([0, 1, 5, 1, 0, -82])!;
  const first = space.bits(a)(s), second = space.bits(b)(s);
  assert.ok(second > first + 1, `{11, 5} ${second} against {11, 3} ${first}`);
  assert.equal(space.bits(a)(s), first, "and each keeps its own");
});
