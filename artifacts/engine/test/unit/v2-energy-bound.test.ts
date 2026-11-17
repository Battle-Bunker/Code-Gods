/**
 * The estimator's "bound, not found" flag reaches the player (coordinator, 17 November): a value whose energy is an upper
 * bound (the work budget ran out) carries `bound`, so the commit stores it and the app marks the figure; a found one
 * carries none. What would break: the flag dropped between the estimator and the stored value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleKey } from "@workspace/v2-valuation";
import { decode, typeOf, valuesOf } from "../../convex/v2/world.ts";

const seat = (params: unknown) => {
  const type = typeOf("line-q"), variant = type.variants.find(v => v.id === "line-q") ?? type.variants[0]!;
  return [{ memberId: "m1", rule: { family: "ring", params, tieBreaker: null, ruleKey: ruleKey(type, variant, "ring", params, "none"), contentHash: "" } }];
};

test("an energy the estimator could only bound says so; a found one does not", () => {
  // A 40-bit newborn line (lib/v2-linear energy.test.ts): the budget runs out on it under this ring.
  const big = decode("-25010251428701900041527,27674200679298411284156,-39294336813435755596445", "line-q");
  for (let i = 0; i < 5; i++) assert.equal(valuesOf(big, "line-q", seat({ u: 2, v: 1, rho: 7 }), 1)[0]!.bound, true, "the 40-bit line is a bound");
  const small = decode("1,2,3", "line-q");
  assert.equal(valuesOf(small, "line-q", seat({ u: 2, v: 1, rho: 7 }), 1)[0]!.bound, undefined, "a small line's energy is found");
});
