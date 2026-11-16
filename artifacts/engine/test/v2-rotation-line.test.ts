/**
 * v1's rotation line on the end page ("Game n of 3 … play again with the same players and you get X's rule"):
 * `v2/rooms:round`'s `next` names whose rule in the latest game the caller is dealt next. What would break: a name whose
 * rule is not the one the next game deals, or a line when the next deal is fresh (the round is over).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { humans, perform } from "./v2-helpers.ts";

test("rooms:round names whose rule you get next, and the next game deals you exactly that rule", { timeout: 240_000 }, async () => {
  const [ada] = await humans("Rotation Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Rotation room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const g1 = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  await perform(ada!, "game.end", {}, { gameId: g1 });
  const round = await ada!.query("v2/rooms:round", { roomId });
  assert.ok(round && round.of >= 2 && round.round === 1, JSON.stringify(round));
  assert.ok(round.next, "after game 1 of a rotation, someone's rule comes next");
  const held = (await ada!.query("v2/games:details", { gameId: g1 })).rules;
  const from = held.find((r: any) => r.memberId === round.next.memberId);
  assert.ok(from && from.name === round.next.name && from.name !== "Rotation Ada");
  const g2 = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  const mine = (await perform(ada!, "rule.explain", {}, { gameId: g2 }, "query")).result;
  assert.deepEqual([mine.family, mine.params], [from.family, from.params ?? {}], "the next game deals the named player's rule");
  await perform(ada!, "game.end", {}, { gameId: g2 });
});
