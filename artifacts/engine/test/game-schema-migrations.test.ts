/**
 * The component migrations (convex/migrations.ts runAll, @convex-dev/migrations; CLAUDE.md "Schema migrations") on
 * rows stored before the change, against the live local backend. What would break: a row left in the old shape after
 * the migration reports success (the later narrowing would then fail to deploy), or a second run changing anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rankTotals } from "@workspace/game-core";
import { admin, api, envelope, internal, raw, roomWith, gods, startGame, touch, TS, waitFor } from "./game-helpers.ts";

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

test("backfillObjectViews: a game stored before the per-god read model gets every god's rows and totals; a second run changes nothing", { timeout: 300_000 }, async () => {
  const [host, ada, bo] = await gods("Views Mig Host", "Views Mig Ada", "Views Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT_TS, startingObjectCount: 5 });
  const game = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const views = (godId: string) => admin.query(internal.testing.rawObjectViews, { gameId: game.gameId, godId });
  const strip = (v: any) => ({ rows: v.rows.map(({ _id, _creationTime, ...r }: any) => r).sort((a: any, b: any) => (a.objectId < b.objectId ? -1 : 1)), totals: v.totals && (({ _id, _creationTime, ...t }: any) => t)(v.totals) });
  // The end's fill: every row exact (the others' sum without the live noise).
  const { objects } = await raw(game.gameId);
  const exact = (v: any) => v.rows.length === 5 && v.totals?.objectCount === 5 && v.rows.every((r: any) => {
    const o = objects.find((x: any) => x._id === r.objectId);
    return Math.abs(r.peerNetBits - o.scores.filter((s: any) => s.god !== ada.subject).reduce((n: number, s: any) => n + s.netBits, 0)) < 1e-9;
  });
  const before = await waitFor(async () => { const v = await views(ada.subject); return exact(v) && v; }, "the end's fill");
  await admin.mutation(internal.testing.forgetObjectViews, { gameId: game.gameId });
  assert.deepEqual((await views(ada.subject)).rows, [], "the fixture is legacy");

  await runAll(true);
  // Catches: a game left without rows (its objects panel would be empty), rows that differ from what the start wrote.
  const after = await waitFor(async () => { const v = await views(ada.subject); return v.rows.length === 5 && v.totals && v; }, "the backfilled fill", 60_000, 250);
  assert.deepEqual({ ...strip(after), totals: { ...strip(after).totals, world: 0 } }, { ...strip(before), totals: { ...strip(before).totals, world: 0 } });
  assert.equal((await views(bo.subject)).rows.length, 5, "every god's rows");
  await runAll(true);
  assert.deepEqual(strip(await views(ada.subject)), strip(after), "a second run changes nothing");
});
