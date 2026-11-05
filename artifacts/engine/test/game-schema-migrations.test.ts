/**
 * The component migrations (convex/migrations.ts runAll, @convex-dev/migrations; CLAUDE.md "Schema migrations") on
 * rows stored before the change, against the live local backend. What would break: a row left in the old shape after
 * the migration reports success (the later narrowing would then fail to deploy), or a second run changing anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rankTotals, seedSetupSettings } from "@workspace/game-core";
import { admin, api, envelope, internal, raw, roomWith, gods, setupEntries, startGame, touch, TS, waitFor } from "./game-helpers.ts";

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

test("agentPricesV2: an agent priced with a decision price and a floor keeps only its change estimate; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Price Mig Host", "Price Mig Ada", "Price Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT_TS, planningSeconds: 3600, startingEnergy: 5000 });
  const game = await startGame(host, roomId);
  const summon = (source: string) => ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Priced", language: "typescript", source }, game.gameId) });
  assert.equal((await summon("function agent(n) { return [add(1)]; }")).accepted, true);
  assert.equal((await summon("function agent(n) { return n.digit(0) ? [] : [add(1)]; }")).accepted, true);
  const [legacy, fresh] = (await raw(game.gameId)).agents;
  const freshBefore = { breakdown: fresh.breakdown, expectedActCost: fresh.expectedActCost };
  await admin.mutation(internal.testing.legacyAgentPrice, { agentId: legacy._id, decisionBits: 2.5, perActFloorBits: 2, erasure: 4, motion: 0.5 });
  for (const run of [1, 2]) {
    await runAll(true);
    const agents = (await raw(game.gameId)).agents;
    const a = agents.find((x: any) => x._id === legacy._id), b = agents.find((x: any) => x._id === fresh._id);
    assert.deepEqual(a.breakdown, { read: 0, change: 4.5 }, `run ${run}`);
    assert.equal(a.expectedActCost, 4.5, `run ${run}`);
    assert.equal("decisionBits" in a || "perActFloorBits" in a, false, `run ${run}: legacy fields cleared`);
    assert.deepEqual({ breakdown: b.breakdown, expectedActCost: b.expectedActCost }, freshBefore, `run ${run}: an agent already in the new shape is left alone`);
  }
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("powerV1: a game stored before the power budget gets powerPerSecond, agents their shares, deities their accounts; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Power Mig Host", "Power Mig Ada", "Power Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT_TS, planningSeconds: 3600, startingEnergy: 5000 });
  const game = await startGame(host, roomId);
  const summon = (source: string) => ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Old", language: "typescript", source }, game.gameId) });
  for (const k of [1, 2, 3]) assert.equal((await summon(`function agent(n) { return [add(${k})]; }`)).accepted, true);
  // 1 + 2·2 = 5 bits/s of power; each agent's old 2 bits/s is 40%: three would hold 120%, so they are scaled to 1/3 each.
  await admin.mutation(internal.testing.legacyPower, { gameId: game.gameId, energyPerSecond: 1, agentEnergyPerSecond: 2 });
  const spentBefore = (await raw(game.gameId)).deities.find((d: any) => d.godId === ada.subject).spent;
  for (const run of [1, 2]) {
    await runAll(true);
    const state = await raw(game.gameId);
    const settings = state.game.settings;
    assert.equal(settings.powerPerSecond, 5, `run ${run}`);
    for (const k of ["energyPerSecond", "agentEnergyPerSecond", "agentBatteryActs", "perActFloorBits"]) assert.equal(k in settings, false, `run ${run}: ${k} dropped`);
    for (const a of state.agents) assert.ok(Math.abs(a.powerShare - 1 / 3) < 1e-6, `run ${run}: ${a.powerShare}`);
    const deity = state.deities.find((d: any) => d.godId === ada.subject);
    assert.ok(Math.abs(deity.allocated - 1) < 1e-5, `run ${run}: ${deity.allocated}`);
    assert.ok(deity.account && deity.account.balance > 0 && deity.spent === spentBefore, `run ${run}: ${JSON.stringify(deity)} spent before ${spentBefore}`);
    const other = state.deities.find((d: any) => d.godId === bo.subject);
    assert.equal(other.allocated, 0, `run ${run}`);
  }
  const room = (await admin.query(internal.testing.rawRoom, { roomId })).room;
  assert.equal(typeof room.settings.powerPerSecond, "number");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("objectEventPlaces: rows stored before objectEvents carried index and cost get them from their batch; a second run changes nothing", { timeout: 300_000 }, async () => {
  const [host, ada, bo] = await gods("Places Mig Host", "Places Mig Ada", "Places Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT_TS, powerPerSecond: 200, startingEnergy: 1000 });
  const game = await startGame(host, roomId);
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Test agent", language: "typescript", source: TS.Int }, game.gameId) });
    assert.equal(r.accepted, true, JSON.stringify(r));
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).objectEvents.filter((e: any) => e.kind === "transform").length >= 6, "six transformations", 120_000, 500);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const places = (rows: any[]) => rows.map(r => ({ id: r._id, kind: r.kind, index: r.index, cost: r.cost })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const before = places((await raw(game.gameId)).objectEvents);
  assert.ok(before.every(r => r.index !== undefined) && before.some(r => r.kind === "spawn") && before.some(r => r.kind === "transform"));
  assert.ok(before.filter(r => r.kind === "transform").every(r => typeof r.cost === "number"), "a new transform row carries its cost");

  // Stored as before 2026-11-03: no index, no cost.
  await admin.mutation(internal.testing.stripObjectEventPlaces, { gameId: game.gameId });
  assert.ok(places((await raw(game.gameId)).objectEvents).every(r => r.index === undefined && r.cost === undefined), "the fixture is legacy");

  await runAll(true);
  // Catches: a row left without its place (lib/load.ts would keep its batch-scan fallback forever), a wrong position
  // (the observation's transformation ids `<seq>:<index>` would change), a cost on a spawn.
  const after = (await raw(game.gameId)).objectEvents;
  assert.deepEqual(places(after), before);
  await runAll(true);
  assert.deepEqual((await raw(game.gameId)).objectEvents, after, "a second run changes nothing");
});

test("setupListing: setups stored before the catalogue's index get their order, name key and search text; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [ann] = await gods(`Listing Ann ${Date.now() % 100000}`);
  const tag = `Ünlisted ${Date.now()}`;
  const own = await ann.c.action(api.setups.save, { name: tag, settings: seedSetupSettings("grid-classic") });
  const classic = (await setupEntries(ann.c)).find(e => e.seedId === "grid-classic")!;
  for (const setupId of [own.id, classic.id]) await admin.mutation(internal.testing.legacySetupListing, { setupId });
  const stored = (setupId: string) => admin.query(internal.testing.rawSetupDoc, { setupId });
  assert.equal((await stored(own.id)).order, undefined, "the legacy shape");
  for (const run of [1, 2]) {
    await runAll(true);
    const [mine, seed] = [await stored(own.id), await stored(classic.id)];
    assert.deepEqual([mine.order, mine.nameKey, mine.searchText], [1_000_000, tag.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(), `${tag} ${ann.name} ${mine.summary}`], `run ${run}: everyone's`);
    assert.deepEqual([seed.order, seed.nameKey, seed.searchText], [2, "classic", `Classic System ${seed.summary}`], `run ${run}: the system's (Classic is the third seed)`);
  }
  assert.ok((await setupEntries(ann.c, tag)).some(e => e.id === own.id), "found by the search index");
  await ann.c.mutation(api.setups.remove, { setupId: own.id });
});
