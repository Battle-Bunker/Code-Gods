/**
 * Open bidding (v1's bid visibility "open"): every player's bids per rule, highest first, yours marked. What would
 * break: a family listed nobody bid on, the bids out of order, your own bid shown under your name instead of "you".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { everyonesBids } from "../src/site/lib/open-bids.ts";

test("every bid per family, highest first, yours as you, families in the offer's order", () => {
  const families = [{ family: "a", title: "Alpha" }, { family: "b", title: "Beta" }, { family: "c", title: "Gamma" }];
  const others = [{ memberId: "m2", name: "Bo", bids: [{ family: "b", percent: 10 }, { family: "a", percent: 5 }] }, { memberId: "m3", name: "Cy", bids: [{ family: "b", percent: 25 }] }];
  const mine = [{ family: "b", percent: 15 }];
  assert.deepEqual(everyonesBids(families, others, mine), [
    { family: "a", title: "Alpha", bids: [{ who: "Bo", percent: 5, mine: false }] },
    { family: "b", title: "Beta", bids: [{ who: "Cy", percent: 25, mine: false }, { who: "you", percent: 15, mine: true }, { who: "Bo", percent: 10, mine: false }] },
  ]);
  assert.deepEqual(everyonesBids(families, [], []), []);
});

test("v1's words on the bid screen: Pass or Done bidding, and who is still bidding", async () => {
  const { primaryLabel, doneLine } = await import("../src/site/lib/open-bids.ts");
  assert.equal(primaryLabel([]), "Pass");
  assert.equal(primaryLabel([{}]), "Done bidding");
  assert.equal(doneLine([], 1), "You passed. Waiting for 1 more player…");
  assert.equal(doneLine([{}], 2), "You are done. Waiting for 2 more players…");
  assert.equal(doneLine([], 0), "You passed. Everyone is done: dealing the rules…");
});
