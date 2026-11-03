/**
 * The stored replay (docs/convex-read-architecture.md §4.4): when a game ends, the engine writes its whole replay log
 * once to file storage. It is served only through GET /api/replay/<roomId>/<gameId> (convex/replays.ts), which checks
 * the caller's Convex JWT on every request, never through a storage URL (a bearer capability anyone holding the link
 * could download: sign-in is required for everything). replays.stored says whether the file is there.
 *
 * What would break: the stored log differing from what player.replay pages give (the page would replay another game);
 * the file served to someone the replay refuses (a signed-out caller, a member who neither played, watched nor owns
 * the room, a stranger) or for a live game; a storage URL handed out again.
 * migrations:backfillReplays is tested with the other migrations (game-schema-migrations.test.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import type { ReplayPage } from "@workspace/player-client/replay";
import { SITE_, URL_, admin, api, envelope, gods, internal, rejects, roomWith, startGame, touch, TS, waitFor, type God } from "./game-helpers.ts";

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

/**
 * A real Convex JWT for `god` (what the app's Convex client sends): a player JWT minted by /api/device/token from a
 * seeded `cgc_` credential bound to `roomId`. (The other tests impersonate with the admin key, which HTTP cannot.)
 */
async function jwtFor(god: God, roomId: string): Promise<string> {
  const credential = `cgc_${randomBytes(32).toString("base64url")}`;
  await admin.mutation(internal.testing.seedCredential, { subject: god.subject, roomId, permission: "read", tokenHash: createHash("sha256").update(credential).digest("hex") });
  const response = await fetch(`${SITE_}/api/device/token`, { method: "POST", headers: { authorization: `Bearer ${credential}` } });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json() as { token: string }).token;
}
const download = (roomId: string, gameId: string, token?: string) =>
  fetch(`${SITE_}/api/replay/${encodeURIComponent(roomId)}/${encodeURIComponent(gameId)}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

test("an ended game's replay is stored once and served only to whoever may watch it, with their JWT", { timeout: 240_000 }, async () => {
  const [host, ada, bo, late, stranger] = await gods("Store Host", "Store Ada", "Store Bo", "Store Late", "Store Stranger");
  await touch(host);
  const { roomId, shortCode } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const ok = async (p: Promise<any>) => { const r = await p; assert.equal(r.accepted, true, r.message); };
  await ok(ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Ada adds", language: "typescript", source: TS.Int }, game.gameId) }));
  await ok(bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "stored-chat" }, game.gameId) }));
  const adaJwt = await jwtFor(ada, roomId);

  // Live: refused (the transparency starts at the end), by the query and by the download.
  assert.match(await rejects(ada.c.query(api.replays.stored, { roomId, gameId: game.gameId })), /opens when the game ends/);
  const live = await download(roomId, game.gameId, adaJwt);
  assert.equal(live.status, 409, "a live game's replay is refused");
  assert.match((await live.json() as { error: string }).error, /opens when the game ends/);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });

  const stored = await waitFor(async () => { const s = await ada.c.query(api.replays.stored, { roomId, gameId: game.gameId }); return s.stored ? s : null; }, "the stored replay", 60_000, 250);
  // Catches: a storage URL handed out again (anyone with the link could download it).
  assert.deepEqual(Object.keys(stored).sort(), ["stored", "viewer"]);
  assert.ok(!JSON.stringify(stored).includes("http"), "no URL in the answer");

  // Signed out: 401, whatever the game.
  const anonymous = await download(roomId, game.gameId);
  assert.equal(anonymous.status, 401);
  assert.equal((await download(roomId, game.gameId, "not-a-jwt")).status, 401, "a malformed token is no sign-in");

  // A player: the whole replay, the same pages player.replay gives.
  const response = await download(roomId, game.gameId, adaJwt);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.match(response.headers.get("cache-control") ?? "", /private/, "never cached by a shared cache");
  const file = await response.json() as { version: number; pages: Omit<ReplayPage, "viewer">[] };
  const paged = await pagedReplay(ada, roomId, game.gameId);
  assert.deepEqual(stored.viewer, paged[0].viewer, "the caller's own place, as player.replay gives it");
  assert.equal(stored.viewer.godId, ada.subject);
  assert.deepEqual(file.pages.map(p => ({ ...p, viewer: stored.viewer })), paged);
  assert.ok(JSON.stringify(file).includes("stored-chat"), "the game's chat is in it");
  // The room owner too, by the game's short code as well as its id.
  assert.equal((await download(roomId, game.shortCode, await jwtFor(host, roomId))).status, 200);

  // Same access as the replay: not a member who joined after, nor someone who never joined.
  await late.c.mutation(api.rooms.join, { room: shortCode });
  assert.equal(await rejects(late.c.query(api.replays.stored, { roomId, gameId: game.gameId })), await rejects(late.c.query(api.player.replay, { roomId, gameId: game.gameId })));
  const lateDownload = await download(roomId, game.gameId, await jwtFor(late, roomId));
  assert.equal(lateDownload.status, 403);
  assert.match((await lateDownload.json() as { error: string }).error, /past game/);
  assert.equal((await download(roomId, game.gameId, await jwtFor(stranger, roomId))).status, 403);
  // A credential bound to another room never reaches this one.
  const other = await roomWith([ada]);
  assert.equal((await download(roomId, game.gameId, await jwtFor(ada, other.roomId))).status, 403);
  assert.equal((await download(roomId, "no-such-game", adaJwt)).status, 404);
  const malformed = await fetch(`${SITE_}/api/replay/${roomId}/%E0%A4%A`, { headers: { authorization: `Bearer ${adaJwt}` } });
  assert.equal(malformed.status, 400, "a malformed path is a 400 with CORS headers, not a crash");
  assert.equal(malformed.headers.get("access-control-allow-origin"), "*");
  assert.ok(await rejects(new ConvexHttpClient(URL_).query(api.replays.stored, { roomId, gameId: game.gameId })), "signed out: refused");
});
