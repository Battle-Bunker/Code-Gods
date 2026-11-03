/**
 * A deploy must not interrupt a game in progress (owner, 2026-11-03: a production game stopped when release #197 re-keyed
 * the calibration tables; ticks failed from `convex deploy` until the new files were uploaded, silently).
 *
 * What would break:
 * - a game that looks its tables up by today's keys: a deploy that re-keys them (a family's params or card changed) or
 *   hides them leaves it without tables. A game scores with the tables it was dealt with, pinned (engine/pinned.ts).
 * - a failing tick that stalls silently: the game must show "The engine hit an error and is retrying" to players and
 *   spectators (without the raw error, which may name a god's family), retry with backoff, and clear it on recovery.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const INSTANCE = "Grid(4,base10,rgb)";
const GRID_4 = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Grid",
  typeArgs: { size: 4, symbols: "base10", colours: "rgb" }, spawnRateHz: 0.5, startingObjectCount: 3, halfLifeSeconds: 100000, defenceGoals: true };
/** One god each: today's params, and the same utilities as stored before their families were typed (#184). */
const TYPED = [
  { familyId: "kingdom", params: { colour: "blue" } },
  { familyId: "picture_frame", params: { colour: "green" }, penalty: { familyId: "hate_colour", params: { colour: "red" } } },
  { familyId: "magic_accountant", params: { axis: "rows", target: 18 } },
];
const LEGACY = [
  { familyId: "kingdom", params: { C: 2 } },
  { familyId: "picture_frame", params: { X: 1 }, penalty: { familyId: "hate_colour", params: { colour: 0 } } },
  { familyId: "magic_accountant", params: { axis: "rows", T: 18 } },
];

async function runningGame(prefix: string) {
  const trio = await gods(`${prefix} Host`, `${prefix} Ada`, `${prefix} Bo`);
  const [host] = trio;
  await touch(host);
  const { roomId } = await roomWith(trio, GRID_4);
  const game = await startGame(host, roomId);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.phase === "running", "running");
  return { trio, host, roomId, ...game };
}
const commits = async (gameId: string) => (await raw(gameId)).game.stats.commits as number;
const gameDoc = (gameId: string) => admin.query(internal.testing.rawGameDoc, { gameId });

test("a game in progress keeps scoring with its pinned tables when a deploy re-keys or hides the shipped ones", { timeout: 240_000 }, async () => {
  const { host, roomId, gameId } = await runningGame("Pin");
  try {
    // Pinned at the start: the deal's tables, by god.
    const atStart = (await gameDoc(gameId))?.tablesStorageId;
    assert.ok(atStart, "the start pins the deal's tables");
    // Deal known utilities and let the next tick pin them (as a game started before pinning does).
    await admin.mutation(internal.testing.legacyUtilities, { gameId, utilities: TYPED });
    assert.equal(await admin.mutation(internal.testing.setGameTables, { gameId }), atStart);
    const repinned = await waitFor(async () => (await gameDoc(gameId))?.tablesStorageId, "an unpinned game pins itself on its next tick", 30_000, 250);
    const scored = (await raw(gameId)).objects.map((o: any) => o.scores);

    // The deploy: the shipped file goes (every engine process sees it within the index TTL), then the gods' stored params
    // change shape (a re-key: no table is found under today's key for them, and no per-process memo has them).
    assert.equal(await admin.mutation(internal.testing.hideCalibration, { instance: INSTANCE, hidden: true }), true);
    await new Promise(r => setTimeout(r, 62_000));
    await admin.mutation(internal.testing.legacyUtilities, { gameId, utilities: LEGACY });
    const before = await commits(gameId);
    await touch(host);
    // Catches: a tick that resolves tables by key (it throws "No calibration table" and the game stops).
    await waitFor(async () => (await commits(gameId)) >= before + 5, "the game keeps ticking through the deploy", 30_000, 250);
    const after = await raw(gameId);
    assert.equal(after.game.engineError, undefined, "no tick failed");
    assert.equal((await gameDoc(gameId))?.tablesStorageId, repinned, "the pin never changes");
    assert.ok(after.objects.length > scored.length, "spawns are scored with the pinned tables");
    for (const o of after.objects) assert.ok(o.scores.every((s: any) => Number.isFinite(s.netBits)));
  } finally {
    await admin.mutation(internal.testing.hideCalibration, { instance: INSTANCE, hidden: false });
    await host.c.mutation(api.rooms.endActiveGame, { roomId }).catch(() => {});
  }
});

test("a tick that keeps failing is shown to players and spectators, retried with backoff, and cleared on recovery", { timeout: 180_000 }, async () => {
  const { trio, host, roomId, gameId, shortCode } = await runningGame("Fail");
  const [, ada] = trio;
  try {
    const pinned = (await gameDoc(gameId))!.tablesStorageId;
    const junk = await admin.action(internal.testing.junkFile, {});
    await admin.mutation(internal.testing.setGameTables, { gameId, storageId: junk });
    const failing = await waitFor(async () => { const e = (await gameDoc(gameId))?.engineError; return e && e.failures >= 3 && e; }, "three failed ticks", 60_000, 250);
    // Backoff: 2 s, 4 s, 8 s … (lib/engineErrors.ts retryDelayMs), never a tight loop.
    assert.ok(failing.retryAt - Date.now() <= 8_000 + 1_000 && failing.since <= Date.now() - 5_000, `backed off: ${JSON.stringify(failing)}`);
    const before = await commits(gameId);

    const obs = await ada.c.query(api.player.observation, { roomId });
    assert.equal(obs.notice?.kind, "retrying");
    assert.match(obs.notice.text, /^The engine hit an error and is retrying: an internal error \(\d+ tries so far\)\.$/);
    const header = await host.c.query(api.games.header, { code: shortCode });
    assert.equal(header.notice?.text.startsWith("The engine hit an error and is retrying"), true, "the game page shows it too");
    // Disclosure: the raw error never reaches a player (it may name a god's family or params).
    assert.doesNotMatch(JSON.stringify([obs.notice, header.notice]), /pinned|format|kingdom|chessmaster|calibration table for/i);

    // Recovery: the next retry succeeds, the notice goes and the world moves again.
    await admin.mutation(internal.testing.setGameTables, { gameId, storageId: pinned });
    await waitFor(async () => (await commits(gameId)) > before && !(await gameDoc(gameId))?.engineError, "the game recovers by itself", 40_000, 250);
    assert.equal((await ada.c.query(api.player.observation, { roomId })).notice, undefined);
    assert.equal((await host.c.query(api.games.header, { code: shortCode })).notice, null);
  } finally {
    await host.c.mutation(api.rooms.endActiveGame, { roomId }).catch(() => {});
  }
});
