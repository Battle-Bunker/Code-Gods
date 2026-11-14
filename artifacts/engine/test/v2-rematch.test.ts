/**
 * `game.rematch` (playtest round 8): the room's last game dealt again, the same rule to each player and the same seed,
 * so the same objects are born; refused while the last game is on, and when the seated players changed.
 *
 * What would break: a rematch dealt afresh (other rules or other starting lines), so two games cannot be compared.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

/** A mutation's failure: the outcome its rolled-back transaction carried (defineOp throws it as a ConvexError). */
async function failure(p: Promise<any>) {
  try { const out = await p; assert.equal(out.ok, false, JSON.stringify(out)); return out.error; } catch (e) { return (e as any).data?.error; }
}
async function playBriefly(ada: any, gameId: string) {
  assert.equal((await perform(ada, "game.startWorldNow", {}, { gameId })).ok, true);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal((await perform(ada, "game.end", {}, { gameId })).ok, true);
}
async function dealOf(gameId: string) {
  const events = await admin.query("v2/testing:events", { gameId, after: -1 });
  const started = events.find((e: any) => e.kind === "gameStarted").data;
  const born = events.filter((e: any) => e.kind === "objectBorn" && e.data.worldSeconds === 0).map((e: any) => [e.data.number, e.data.state, e.data.worldSeconds]);
  return { seed: started.seed, rules: Object.fromEntries(started.players.map((p: any) => [p.memberId, p.ruleKey])), born };
}

test("a rematch deals the last game again: the same rules, seed and starting objects", { timeout: 120_000 }, async () => {
  const [ada] = await humans("Rematch Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Rematch room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.match((await failure(perform(ada!, "game.rematch", {}, { roomId }))).message, /no last game/);
  const first = (await perform(ada!, "game.start", {}, { roomId })).result.gameId;
  assert.ok(await failure(perform(ada!, "game.rematch", {}, { roomId })), "refused while the last game is on");
  await playBriefly(ada, first);

  const again = await perform(ada!, "game.rematch", {}, { roomId });
  assert.equal(again.ok, true, JSON.stringify(again));
  const second = again.result.gameId;
  assert.notEqual(second, first);
  await playBriefly(ada, second);
  const [a, b] = [await dealOf(first), await dealOf(second)];
  assert.equal(b.seed, a.seed);
  assert.deepEqual(b.rules, a.rules, "each player has the rule they had");
  assert.ok(a.born.length > 0);
  assert.deepEqual(b.born, a.born, "the same starting objects");

  const kicked = (await ada!.query("v2/rooms:get", { roomId })).members.find((m: any) => m.kind !== "human");
  assert.equal((await perform(ada!, "seats.removeAi", { memberId: kicked.memberId }, { roomId })).ok, true);
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.match((await failure(perform(ada!, "game.rematch", {}, { roomId }))).message, /same seated players/, "a different table cannot have the same deal");
});
