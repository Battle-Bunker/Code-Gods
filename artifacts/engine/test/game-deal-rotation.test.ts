/**
 * The rotated deal on the real start (convex/lib/dealRotation.ts, convex/owner.ts): a room that plays again with the
 * same players gets the last game's rules passed one seat along, with a line on each card, until everyone has held
 * each rule; then a fresh deal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, gods, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("playing again with the same three players: two passed-on games, then a fresh deal", { timeout: 600_000 }, async () => {
  const members = await gods("Rota", "Rotb", "Rotc");
  await Promise.all(members.map(touch));
  const owner = members[0];
  const { roomId } = await roomWith(members, {});
  const play = async () => {
    const { gameId } = await startGame(owner, roomId);
    const g = await raw(gameId);
    const deities = [...g.deities].sort((a: any, b: any) => a.index - b.index);
    await owner.c.mutation(api.rooms.endActiveGame, { roomId });
    await waitFor(async () => (await raw(gameId)).game.phase === "ended" || undefined, "the game ends");
    return { godIds: deities.map((d: any) => d.godId as string), utilities: deities.map((d: any) => JSON.stringify(d.utility)), cards: deities.map((d: any) => d.card), names: g.game.roster.map((r: any) => r.name as string) };
  };
  const first = await play();
  assert.ok(first.cards.every((c: any) => c.rotation === undefined), "the first game is an ordinary deal");
  let last = first;
  for (const round of [2, 3]) {
    const next = await play();
    next.godIds.forEach((g, k) => {
      const before = last.godIds.indexOf(g), from = (before - 1 + 3) % 3;
      assert.equal(next.utilities[k], last.utilities[from], `round ${round}: ${g} holds the rule of the player before them`);
      assert.deepEqual(next.cards[k].rotation, { round, of: 3, from: last.names[from] });
    });
    last = next;
  }
  const fresh = await play();
  assert.ok(fresh.cards.every((c: any) => c.rotation === undefined), "after everyone has held each rule, a fresh deal");
});
