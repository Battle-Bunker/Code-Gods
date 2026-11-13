/**
 * The rotated deal (convex/lib/dealRotation.ts, docs/beginner-pool.md §6): when a room plays again with the same players
 * and the same dealing settings, the last game's rules pass one seat along, until every player has held every rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rotatedDeal, type PastDeal } from "../../convex/lib/dealRotation.ts";

const u = (familyId: string) => ({ familyId, params: {} });
const KEY = "deal-key";
const past = (godIds: string[], families: string[], dealKey = KEY, bid = false): PastDeal => ({ godIds, utilities: families.map(u), dealKey, bid });

test("no earlier game: a fresh deal", () => {
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, []), null);
});

test("after one game the rules pass one seat along: seat k gets seat k−1's rule", () => {
  const next = rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]);
  assert.deepEqual(next?.utilities.map(x => x.familyId), ["z", "x", "y"]);
  assert.deepEqual([next?.round, next?.of], [2, 3]);
  assert.deepEqual(next?.from, ["c", "a", "b"]);
});

test("the new seat order does not matter: each player gets the rule of the player before them last game", () => {
  const next = rotatedDeal(["c", "a", "b"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]);
  assert.deepEqual(next?.utilities.map(x => x.familyId), ["y", "z", "x"]);
});

test("after a full round (every player has held every rule) the next game is dealt afresh", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]), g2 = past(["a", "b", "c"], ["z", "x", "y"]), g3 = past(["a", "b", "c"], ["y", "z", "x"]);
  assert.deepEqual(rotatedDeal(["a", "b", "c"], KEY, [g2, g1])?.utilities.map(x => x.familyId), ["y", "z", "x"]);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [g3, g2, g1]), null);
  // ... and the round after that starts from the fresh deal.
  const g4 = past(["a", "b", "c"], ["p", "q", "r"]);
  assert.deepEqual(rotatedDeal(["a", "b", "c"], KEY, [g4, g3, g2, g1])?.round, 2);
});

test("a different set of players, different dealing settings or a deal made with bids: a fresh deal", () => {
  assert.equal(rotatedDeal(["a", "b", "d"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]), null);
  assert.equal(rotatedDeal(["a", "b", "c", "d"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], "other", [past(["a", "b", "c"], ["x", "y", "z"])]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"], KEY, true)]), null);
});

test("params are part of a rule: a game that is not a rotation of the one before starts a new round", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]);
  const g2: PastDeal = { ...past(["a", "b", "c"], ["z", "x", "y"]), utilities: [{ familyId: "z", params: { axis: "rows" } }, u("x"), u("y")] };
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [g2, g1])?.round, 2);
});
