/**
 * The component migrations (convex/migrations.ts runAll, @convex-dev/migrations; CLAUDE.md "Schema migrations") on
 * rows stored before the change, against the live local backend. What would break: a row left in the old shape after
 * the migration reports success (the later narrowing would then fail to deploy), or a second run changing anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rankTotals } from "@workspace/game-core";
import { admin, api, internal, raw, roomWith, gods, startGame, touch, waitFor } from "./game-helpers.ts";

const INT_TS = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int", spawnRateHz: 0, startingObjectCount: 3, halfLifeSeconds: 100000 };

async function runAll(reset: boolean) {
  // The runner starts the migrations one after another: until this run reaches one, it still reports the last run's
  // success, so wait for every one to have started since this call (the backend shares this machine's clock).
  const since = Date.now();
  await admin.mutation(internal.migrations.runAll, reset ? { reset: true } : {});
  return waitFor(async () => {
    const statuses = await admin.query(internal.migrations.status, {}) as { name: string; state: string; processed: number; latestStart?: number }[];
    assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
    return statuses.every(s => s.state === "success" && (!reset || (s.latestStart ?? 0) >= since)) && statuses;
  }, "every migration reports success", 120_000, 250);
}

test("Haskell retired: stored settings drop it (TypeScript when nothing is left); a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Hs Mig Host", "Hs Mig Ada", "Hs Mig Bo");
  await touch(host);
  const both = await roomWith([host, ada, bo], INT_TS);
  const only = await roomWith([host, ada, bo], INT_TS);
  // Settings stored while Haskell was a language.
  await admin.mutation(internal.testing.patchRoom, { roomId: both.roomId, settings: { languages: ["haskell", "python"] } });
  await admin.mutation(internal.testing.patchRoom, { roomId: only.roomId, settings: { languages: ["haskell"] } });
  const languages = async (roomId: string) => (await host.c.query(api.rooms.get, { room: roomId })).settings.languages;
  for (const run of [1, 2]) {
    await runAll(true);
    assert.deepEqual(await languages(both.roomId), ["python"], `run ${run}`);
    assert.deepEqual(await languages(only.roomId), ["typescript"], `run ${run}`);
  }
});

const HOT = ["worldSeconds", "lastTick", "objectCount", "agentCount", "scoreboard", "tick", "nextSpawn", "nextBatch", "stats"] as const;
const docs = (gameId: string) => admin.query(internal.testing.rawGameDocs, { gameId });
const strip = (d: any) => d && Object.fromEntries(Object.entries(d).filter(([k]) => !["_id", "_creationTime"].includes(k)));

test("games split: a stored game's clock and engine state move to gameClocks/gameEngine; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Split Host", "Split Ada", "Split Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT_TS);
  const ended = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const before = await docs(ended.gameId);
  assert.ok(before.clock && before.engine, "a new game is stored split");
  assert.ok(HOT.every(k => before.game[k] === undefined), `a new game's header holds no hot field: ${HOT.filter(k => before.game[k] !== undefined)}`);

  // Stored as before the split: the hot fields on the games doc, no clock or engine doc.
  await admin.mutation(internal.testing.legacyGameHotFields, { gameId: ended.gameId });
  const legacy = await docs(ended.gameId);
  assert.equal(legacy.clock, null);
  assert.equal(legacy.engine, null);
  assert.deepEqual(legacy.game.stats, before.engine.stats, "the fixture is the legacy shape of the same game");

  await runAll(true);
  // Catches: a hot field left on the header (the narrowing would fail to deploy), a value lost or changed in the move.
  const after = await docs(ended.gameId);
  assert.deepEqual(HOT.filter(k => after.game[k] !== undefined), []);
  assert.deepEqual(strip(after.clock), strip(before.clock));
  assert.deepEqual(strip(after.engine), strip(before.engine));
  // Readers see the same game: its final scoreboard and world time.
  const standings = await host.c.query(api.games.standings, { gameId: ended.gameId });
  assert.equal(standings.world, before.clock.scoreboard.world);

  // Idempotent: a second run leaves every document as it is.
  await runAll(true);
  const again = await docs(ended.gameId);
  assert.deepEqual([again.game, again.clock, again.engine], [after.game, after.clock, after.engine]);
});

test("games split: a legacy game still running keeps running, and its next tick commit moves its hot fields off the header", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Split Live Host", "Split Live Ada", "Split Live Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT_TS, planningSeconds: 0 });
  const game = await startGame(host, roomId);
  await waitFor(async () => (await raw(game.gameId)).game.phase === "running" || undefined, "the game runs");
  await admin.mutation(internal.testing.legacyGameHotFields, { gameId: game.gameId });
  const legacy = await docs(game.gameId);
  assert.equal(legacy.clock, null);
  // Catches: the loop failing on (or never splitting) a game stored before the split, as one running at the deploy is.
  const split = await waitFor(async () => { const d = await docs(game.gameId); return d.clock && d.engine && d; }, "the next commit splits the game");
  assert.deepEqual(HOT.filter(k => split.game[k] !== undefined), []);
  assert.ok(split.engine.stats.commits >= legacy.game.stats.commits, "the commit counter carries on");
  const world = split.clock.worldSeconds;
  await waitFor(async () => ((await docs(game.gameId)).clock.worldSeconds > world) || undefined, "world time moves on");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("backfillReplays: ended games stored before stored replays get one; a second run builds nothing again", { timeout: 360_000 }, async () => {
  const [host, ada, bo] = await gods("Replay Mig Host", "Replay Mig Ada", "Replay Mig Bo");
  await touch(host);
  const games: { roomId: string; gameId: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const { roomId } = await roomWith([host, ada, bo], INT_TS);
    const { gameId } = await startGame(host, roomId);
    await host.c.mutation(api.rooms.endActiveGame, { roomId });
    games.push({ roomId, gameId });
  }
  const storageOf = async (gameId: string) => (await admin.query(internal.testing.rawGameDoc, { gameId }))?.replayStorageId as string | undefined;
  for (const { gameId } of games) {
    await waitFor(() => storageOf(gameId), "endGame's build", 60_000, 250);
    await admin.mutation(internal.testing.forgetReplay, { gameId });
  }
  for (const { roomId, gameId } of games) assert.equal((await host.c.query(api.replays.stored, { roomId, gameId })).stored, false, "the fixture is legacy");

  const statuses = await runAll(true);
  assert.ok(statuses.some(s => s.name === "migrations:backfillReplays"));
  // Catches: an ended game left without its file (the builds are spread over a minute).
  const stored = await Promise.all(games.map(({ gameId }) => waitFor(() => storageOf(gameId), "the backfilled build", 150_000, 500)));
  for (const { roomId, gameId } of games) assert.equal((await host.c.query(api.replays.stored, { roomId, gameId })).stored, true);
  // A second run leaves every stored file as it is (the migration skips them; a build would keep the first file).
  await runAll(true);
  assert.deepEqual(await Promise.all(games.map(({ gameId }) => storageOf(gameId))), stored);
});

test("backfillStandings: games stored before the standings read model get it; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("ReadModel Mig Host", "ReadModel Mig Ada", "ReadModel Mig Bo");
  await touch(host);
  // Noise on: a live game's public salience differs from the exact one. Planning holds the live game (no tick publishes).
  const noisy = { ...INT_TS, startingObjectCount: 6, peerNoiseBits: 4, planningSeconds: 3600 };
  const { roomId: endedRoom } = await roomWith([host, ada, bo], noisy);
  const ended = await startGame(host, endedRoom);
  await host.c.mutation(api.rooms.endActiveGame, { roomId: endedRoom });
  const { roomId: liveRoom } = await roomWith([host, ada, bo], noisy);
  const live = await startGame(host, liveRoom);
  const rows = (gameId: string) => admin.query(internal.testing.rawReadModels, { gameId });
  // The ended game's exact salience is written after its end (game/readModel.ts finalizeObjects).
  await waitFor(async () => (await rows(ended.gameId)).objects.every((o: any) => o.publicSalience === o.salience) || undefined, "the end's exact salience");
  for (const g of [ended, live]) await admin.mutation(internal.testing.legacyReadModels, { gameId: g.gameId });
  for (const g of [ended, live]) {
    const legacy = await rows(g.gameId);
    assert.deepEqual([legacy.standings, legacy.history], [[], []], "the fixture is legacy: no standings");
  }
  assert.ok((await rows(live.gameId)).objects.some((o: any) => o.noise !== 0), "the live game's values carry noise");

  await runAll(true);
  for (const [g, isLive] of [[ended, false], [live, true]] as const) {
    const after = await rows(g.gameId);
    const { game } = await raw(g.gameId);
    const board = game.scoreboard;
    // Hand: the standings are rankTotals of the stored scoreboard, one history row (seq 0) carrying it.
    assert.deepEqual(after.standings.map((r: any) => [r.godId, r.rank, r.total, r.world]),
      rankTotals(game.roster.map((m: any) => m.id), board.totals).map(r => [r.godId, r.rank, r.totalPayoff, board.world]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    assert.deepEqual(after.history.map((h: any) => [h.seq, h.world, h.totals]), [[0, board.world, board.totals]]);
    // The writers' side: a live object shows its exact salience, or an ended one its noisy salience.
    for (const o of after.objects) assert.equal(o.publicSalience, o.salience + (isLive ? o.noise : 0), `${isLive ? "live" : "ended"} object ${o.id}`);
  }
  const first = await Promise.all([ended, live].map(g => rows(g.gameId)));
  await runAll(true);
  assert.deepEqual(await Promise.all([ended, live].map(g => rows(g.gameId))), first, "a second run changes nothing");
  await host.c.mutation(api.rooms.endActiveGame, { roomId: liveRoom });
});

test("AI quotas: a room stored with an approved budget (or none) gets the 300k quotas and loses the budget fields; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Quota Mig Host", "Quota Mig Ada", "Quota Mig Bo");
  await touch(host);
  const approved = await roomWith([host, ada, bo], INT_TS);
  const never = await roomWith([host, ada, bo], INT_TS);
  const fresh = await roomWith([host, ada, bo], INT_TS);
  await admin.mutation(internal.testing.legacyAiBudget, { roomId: approved.roomId, aiBudget: 50_000, assistantBudget: 20_000 });
  await admin.mutation(internal.testing.legacyAiBudget, { roomId: never.roomId, aiBudget: 0 });
  const stored = async (roomId: string) => (await admin.query(internal.testing.rawRoom, { roomId })).room;
  for (const run of [1, 2]) {
    await runAll(true);
    for (const roomId of [approved.roomId, never.roomId, fresh.roomId]) {
      const room = await stored(roomId);
      assert.equal(room.aiQuota, 300_000, `run ${run}`);
      assert.equal(room.assistantQuota, 300_000, `run ${run}`);
      assert.equal("aiBudget" in room || "assistantBudget" in room, false, `run ${run}: legacy fields cleared`);
    }
  }
});

const GRID_4 = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Grid",
  typeArgs: { size: 4, symbols: "base10", colours: "rgb" }, spawnRateHz: 0, startingObjectCount: 3, halfLifeSeconds: 100000 };

test("typedParams: gods dealt before their family was typed get named, typed params, and their game's replay file is rebuilt; a second run changes nothing", { timeout: 300_000 }, async () => {
  const [host, ada, bo, cy] = await gods("Typed Mig Host", "Typed Mig Ada", "Typed Mig Bo", "Typed Mig Cy");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo, cy], GRID_4);
  const { gameId } = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const storageOf = async () => (await admin.query(internal.testing.rawGameDoc, { gameId }))?.replayStorageId as string | undefined;
  const built = await waitFor(storageOf, "endGame's build", 60_000, 250);
  // Dealt as stored before typing: colours as indices under one-letter names, Magic Accountant's T, a typed defence goal.
  const legacy = [
    { familyId: "kingdom", params: { C: 2 } },
    { familyId: "picture_frame", params: { X: 1 }, penalty: { familyId: "hate_colour", params: { colour: 0 } } },
    { familyId: "magic_accountant", params: { axis: "rows", T: 18 } },
    { familyId: "set_spotter", params: { diag: false } },
  ];
  await admin.mutation(internal.testing.legacyUtilities, { gameId, utilities: legacy });

  await runAll(true);
  const deities = await admin.query(internal.testing.rawDeities, { gameId });
  // Catches: a legacy descriptor left (the readers' fallbacks could then never be removed), or a value changed in the move.
  assert.deepEqual(deities.map((d: any) => d.utility), [
    { familyId: "kingdom", params: { colour: "blue" } },
    { familyId: "picture_frame", params: { colour: "green", symbol: "0" }, penalty: { familyId: "hate_colour", params: { colour: "red" } } },
    { familyId: "magic_accountant", params: { axis: "rows", target: 18 } },
    { familyId: "set_spotter", params: {} },
  ]);
  assert.deepEqual(deities[0].card.params, [{ key: "colour", label: "Your colour", kind: "colour", value: "blue", text: "blue" }]);
  assert.deepEqual(deities[2].card.params.map((p: any) => [p.key, p.value]), [["axis", "rows"], ["target", 18]]);
  // The stored replay embedded the old descriptors: it is rebuilt from the migrated gods.
  const rebuilt = await waitFor(async () => { const s = await storageOf(); return s && s !== built && s; }, "the rebuilt replay", 150_000, 500);
  const file = await admin.action(internal.testing.replayFile, { storageId: rebuilt });
  assert.deepEqual(file.pages[0].gods.map((g: any) => g.utility), deities.map((d: any) => d.utility));

  await runAll(true);
  assert.deepEqual(await admin.query(internal.testing.rawDeities, { gameId }), deities, "a second run changes nothing");
  assert.equal(await storageOf(), rebuilt, "and keeps the rebuilt file");
});
