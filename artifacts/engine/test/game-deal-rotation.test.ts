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
  const { roomId } = await roomWith(members, { planningSeconds: 5 });
  const play = async (run = true) => {
    const { gameId } = await startGame(owner, roomId);
    const g = await raw(gameId);
    if (run) await waitFor(async () => (await raw(gameId)).game.worldSeconds > 0 || undefined, "the world runs");
    const deities = [...g.deities].sort((a: any, b: any) => a.index - b.index);
    await owner.c.mutation(api.rooms.endActiveGame, { roomId });
    await waitFor(async () => (await raw(gameId)).game.phase === "ended" || undefined, "the game ends");
    return { gameId, rotation: g.game.rotation, godIds: deities.map((d: any) => d.godId as string), utilities: deities.map((d: any) => JSON.stringify(d.utility)), cards: deities.map((d: any) => d.card), names: g.game.roster.map((r: any) => r.name as string) };
  };
  const first = await play();
  assert.ok(first.cards.every((c: any) => c.rotation === undefined), "the first game is an ordinary deal");
  assert.deepEqual([first.rotation?.round, first.rotation?.of, first.rotation?.order, first.rotation?.gameIds], [1, 3, first.godIds, []], "and begins a rotation");
  const held = new Map(first.godIds.map((g, k) => [g, [first.utilities[k]]]));
  const games = [first.gameId];
  // A game ended before its world ran was never played: it neither counts nor breaks the round.
  const unplayed = await (async () => {
    const { gameId } = await startGame(owner, roomId);
    await owner.c.mutation(api.rooms.endActiveGame, { roomId });
    await waitFor(async () => (await raw(gameId)).game.phase === "ended" || undefined, "the game ends");
    return (await raw(gameId)).game.worldSeconds;
  })();
  if (unplayed > 0) console.warn(`the planning-only game ran ${unplayed} world seconds: that check is not exercised`);
  let last = first;
  for (const round of [2, 3]) {
    const next = await play();
    next.godIds.forEach((g, k) => {
      const before = last.godIds.indexOf(g), from = (before - 1 + 3) % 3;
      assert.equal(next.utilities[k], last.utilities[from], `round ${round}: ${g} holds the rule of the player before them`);
      assert.deepEqual(next.cards[k].rotation, { round, of: 3, from: last.names[from] });
      held.get(g)!.push(next.utilities[k]);
    });
    assert.deepEqual([next.rotation?.round, next.rotation?.gameIds], [round, games], "the game records the round's earlier games");
    games.push(next.gameId);
    last = next;
  }
  for (const [g, rules] of held) assert.equal(new Set(rules).size, 3, `${g} held each of the three rules exactly once`);
  const fresh = await play();
  assert.ok(fresh.cards.every((c: any) => c.rotation === undefined), "after everyone has held each rule, a fresh deal");
  assert.deepEqual([fresh.rotation?.round, fresh.rotation?.of, fresh.rotation?.gameIds], [1, 3, []], "which starts the next rotation");
  // A setting that decides the deal changes: the next game is dealt afresh, though the players are the same.
  const room = await owner.c.query(api.rooms.get, { room: roomId });
  const excluded = [...room.settings.excludedFamilies, JSON.parse(fresh.utilities[0]).familyId === "leapfrog" ? "two_pair" : "leapfrog"];
  await owner.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { excludedFamilies: excluded } });
  const changed = await play();
  assert.ok(changed.cards.every((c: any) => c.rotation === undefined), "a changed dealing setting deals afresh");
  assert.equal(changed.rotation?.round, 1);
});
