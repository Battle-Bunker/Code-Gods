/**
 * The stored replay (docs/convex-read-architecture.md §4.4): when a game ends, the engine writes its whole replay log
 * once to file storage, and replays.url gives a permitted viewer its URL. What would break: the stored log differing
 * from what player.replay pages give (the page would replay another game), the URL given to someone the replay
 * refuses (a member who neither played, watched nor owns the room; a signed-out caller) or for a live game.
 * migrations:backfillReplays is tested with the other migrations (game-schema-migrations.test.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import type { ReplayPage } from "@workspace/player-client/replay";
import { URL_, api, envelope, gods, rejects, roomWith, startGame, touch, TS, waitFor } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, interactionRateHz: 20, planningSeconds: 3600,
  halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};

async function pagedReplay(god: { c: ConvexHttpClient }, roomId: string, gameId: string): Promise<ReplayPage[]> {
  const pages: ReplayPage[] = [];
  for (let cursor: Record<string, number> | undefined; ;) {
    const page: ReplayPage = await god.c.query(api.player.replay, { roomId, gameId, ...cursor });
    pages.push(page);
    if (page.done) return pages;
    cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor, ...(page.eventOffset !== undefined ? { eventOffset: page.eventOffset } : {}) };
  }
}
const storedUrl = (god: { c: ConvexHttpClient }, roomId: string, gameId: string) =>
  waitFor(async () => (await god.c.query(api.replays.url, { roomId, gameId }))?.url ? god.c.query(api.replays.url, { roomId, gameId }) : null, "the stored replay", 60_000, 250);

test("an ended game's replay is stored once: the same pages player.replay gives, its URL only for whoever may watch it", { timeout: 240_000 }, async () => {
  const [host, ada, bo, late] = await gods("Store Host", "Store Ada", "Store Bo", "Store Late");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const ok = async (p: Promise<any>) => { const r = await p; assert.equal(r.accepted, true, r.message); };
  await ok(ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Ada adds", language: "typescript", source: TS.Int }, game.gameId) }));
  await ok(bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "stored-chat" }, game.gameId) }));
  // Live: no URL, as no replay (the transparency starts at the end).
  assert.match(await rejects(ada.c.query(api.replays.url, { roomId, gameId: game.gameId })), /opens when the game ends/);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });

  const stored = await storedUrl(ada, roomId, game.gameId);
  const file = await (await fetch(stored.url)).json() as { version: number; pages: Omit<ReplayPage, "viewer">[] };
  // Catches: a stored log that differs from the paged one (the one source both are built from).
  const paged = await pagedReplay(ada, roomId, game.gameId);
  assert.deepEqual(stored.viewer, paged[0].viewer, "the caller's own place, as player.replay gives it");
  assert.equal(stored.viewer.godId, ada.subject);
  assert.deepEqual(file.pages.map(p => ({ ...p, viewer: stored.viewer })), paged);
  assert.ok(JSON.stringify(file).includes("stored-chat"), "the game's chat is in it");

  // Same access as the replay: players and the owner; not a member who joined after (nor anyone signed out).
  assert.ok((await host.c.query(api.replays.url, { roomId, gameId: game.gameId })).url);
  await late.c.mutation(api.rooms.join, { room: shortCode });
  assert.equal(await rejects(late.c.query(api.replays.url, { roomId, gameId: game.gameId })), await rejects(late.c.query(api.player.replay, { roomId, gameId: game.gameId })));
  assert.ok(await rejects(new ConvexHttpClient(URL_).query(api.replays.url, { roomId, gameId: game.gameId })), "signed out: refused");
});
