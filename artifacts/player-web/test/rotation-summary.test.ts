import { test } from "node:test";
import assert from "node:assert/strict";
import { rotationSummary } from "../src/panes/results-headline.ts";

const round = {
  round: 2, of: 3,
  games: [{ gameId: "g2", number: 2 }, { gameId: "g1", number: 1 }],
  totals: [{ memberId: "a", name: "Ada", net: 900 }, { memberId: "me", name: "Sam", net: 700 }, { memberId: "b", name: "Bo", net: 700 }],
};

test("an ended game in a rotation says which game of the round it was and ranks the running totals, ties shared", () => {
  const s = rotationSummary(round, "me", "g2")!;
  assert.equal(s.heading, "Game 2 of 3 in this rotation: every player gets each rule once. Totals so far:");
  assert.deepEqual(s.rows.map(r => [r.name, r.rank, r.mine]), [["Ada", 1, false], ["Sam", 2, true], ["Bo", 2, false]]);
});

test("the last game of a round says the round is over", () => {
  assert.match(rotationSummary({ ...round, round: 3 }, "me", "g2")!.heading, /^The rotation is over: every player has had each rule once\. Final totals:/);
});

test("nothing when there is no round or this game is not in it", () => {
  assert.equal(rotationSummary(null, "me", "g2"), null);
  assert.equal(rotationSummary(round, "me", "g9"), null);
});
