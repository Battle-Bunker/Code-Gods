/**
 * The component migrations (convex/migrations.ts runAll, @convex-dev/migrations; CLAUDE.md "Schema migrations") on
 * rows stored before the change, against the live local backend. What would break: an existing room's owner turned
 * into a spectator (their room would stop starting with its players), a member or game left without the field after
 * the migration reports success (the later narrowing would then fail to deploy), or a second run changing anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
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

test("spectators backfill: stored members keep playing, stored games had no spectators; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Mig Host", "Mig Ada", "Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT_TS);
  const game = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await admin.mutation(internal.testing.legacySpectators, { roomId });
  assert.ok((await admin.query(internal.testing.rawMembers, { roomId })).every((m: any) => m.spectator === undefined), "the fixture is legacy");

  const statuses = await runAll(true);
  assert.ok(["migrations:backfillGameSpectators", "migrations:backfillMemberSpectator"].every(name => statuses.some(s => s.name === name)));
  // Catches: the owner (or anyone) backfilled as a spectator; a row left unset.
  const members = await admin.query(internal.testing.rawMembers, { roomId }) as any[];
  assert.deepEqual(members.map(m => m.spectator), [false, false, false]);
  assert.deepEqual((await raw(game.gameId)).game.spectators, []);
  // The room still starts with the same three players.
  const next = await startGame(host, roomId);
  assert.equal((await raw(next.gameId)).game.roster.length, 3);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });

  // Idempotent: a run over migrated rows (a new member already has the field) keeps every value.
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true });
  await runAll(true);
  assert.deepEqual((await admin.query(internal.testing.rawMembers, { roomId }) as any[]).map(m => [m.godId === host.subject, m.spectator]).sort(),
    [[false, false], [false, false], [true, true]]);
});

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
  const view = await host.c.query(api.games.view, { code: ended.shortCode });
  assert.equal(view.worldSeconds, before.clock.worldSeconds);
  assert.equal(view.leaderboardWorldSeconds, before.clock.scoreboard.world);

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
  for (const { roomId, gameId } of games) assert.equal((await host.c.query(api.replays.url, { roomId, gameId })).url, null, "the fixture is legacy");

  const statuses = await runAll(true);
  assert.ok(statuses.some(s => s.name === "migrations:backfillReplays"));
  // Catches: an ended game left without its file (the builds are spread over a minute).
  const stored = await Promise.all(games.map(({ gameId }) => waitFor(() => storageOf(gameId), "the backfilled build", 150_000, 500)));
  for (const { roomId, gameId } of games) assert.ok((await host.c.query(api.replays.url, { roomId, gameId })).url);
  // A second run leaves every stored file as it is (the migration skips them; a build would keep the first file).
  await runAll(true);
  assert.deepEqual(await Promise.all(games.map(({ gameId }) => storageOf(gameId))), stored);
});
