import assert from "node:assert/strict";
import { test } from "node:test";
import { cardRotation, rotationText } from "../src/site/lib/rotation.ts";

test("a passed-on rule says which game of the round this is and who held it last game; an ordinary card says nothing", () => {
  const r = cardRotation({ name: "Leapfrog", rotation: { round: 2, of: 3, from: "Alice" } });
  assert.deepEqual(r, { round: 2, of: 3, from: "Alice" });
  assert.match(rotationText(r!), /^Game 2 of 3: Alice held this rule last game\./);
  assert.equal(cardRotation({ name: "Leapfrog" }), null);
  assert.equal(cardRotation(null), null);
});

const board = (a: number, b: number, c: number) => [{ deityId: "a", name: "Ada", totalPayoff: a }, { deityId: "b", name: "Bo", totalPayoff: b }, { deityId: "c", name: "Cy", totalPayoff: c }];
test("the results of a rotation's game: whose rule you get next, and the totals over the rotation so far", async () => {
  const { rotationStatus } = await import("../src/site/lib/rotation.ts");
  const g1 = { id: "g1", leaderboard: board(10, 20, 30), rotation: { round: 1, of: 3, order: ["a", "b", "c"], gameIds: [] } };
  const g2 = { id: "g2", leaderboard: board(30, 5, 10), rotation: { round: 2, of: 3, order: ["a", "b", "c"], gameIds: ["g1"] } };
  const s1 = rotationStatus(g1, [g1], "b")!;
  assert.match(s1.line, /^Game 1 of 3 in this rotation\. Play again with the same players and you get Ada's rule/);
  assert.match(rotationStatus(g1, [g1], "a")!.line, /you get Cy's rule/);
  const s2 = rotationStatus(g2, [g2, g1], "a")!;
  assert.deepEqual(s2.totals, [{ deityId: "a", name: "Ada", total: 40 }, { deityId: "c", name: "Cy", total: 40 }, { deityId: "b", name: "Bo", total: 25 }]);
  const g3 = { id: "g3", leaderboard: board(1, 1, 1), rotation: { round: 3, of: 3, order: ["a", "b", "c"], gameIds: ["g1", "g2"] } };
  assert.match(rotationStatus(g3, [g3, g2, g1], "a")!.line, /^Game 3 of 3: everyone has now held each rule once/);
  assert.equal(rotationStatus(g3, [g3, g2], "a")!.totals, null, "an earlier game missing from the history: no totals");
  assert.equal(rotationStatus({ id: "x", leaderboard: board(1, 2, 3) }, [], "a"), null);
});
