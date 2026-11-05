/**
 * The spectator read model (docs/convex-read-architecture.md §4.1-§4.2, §6 PR 3): the tick writes small documents
 * (standings, one standingsHistory row per published scoreboard, each object's publicSalience) and the spectator page
 * reads one document or one index page per component: games.header (cold), games.standings, games.standingsHistory,
 * games.instance, games.objectIds (a page of objects.by_game_salience), games.object, rooms.chat.
 *
 * What would break: standings that drift from the published scoreboard (or move between publications), a history that
 * misses or repeats a publication, a skeleton not ordered by the disclosed salience, an object row showing the exact
 * salience while the game is live (or a noisy one once it ended), a header carrying hot fields (it would re-run every
 * tick), a game's chat mixed with another game's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rankTotals } from "@workspace/game-core";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 30, spawnRateHz: 1,
  interactionRateHz: 20, planningSeconds: 3600, halfLifeSeconds: 1e9, powerPerSecond: 200, startingEnergy: 1000, scoreIntervalSeconds: 2,
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("spectator read model: header, standings and their history, the salience skeleton, object rows, instance and chat", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Spec Host", "Spec Ada", "Spec Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const say = async (text: string, gameId?: string) => {
    const r = await host.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text }, gameId) });
    assert.equal(r.accepted, true, r.message);
  };
  await say("Before the game");
  const game = await startGame(host, roomId);
  const [watcher] = await gods("Spec Watcher");

  // ---- the header: cold fields only -----------------------------------------------------------------------------
  const header = await watcher.c.query(api.games.header, { code: game.shortCode });
  assert.equal(header.id, game.gameId);
  assert.equal(header.status, "active");
  assert.equal(header.phase, "planning");
  assert.equal(header.roomId, roomId);
  assert.deepEqual(header.roster.map((m: any) => m.id).sort(), [host, ada, bo].map(g => g.subject).sort());
  // Catches: a hot field (written every tick) or the world on the header, which every page component reads.
  for (const hot of ["worldSeconds", "lastTick", "objectCount", "agentCount", "objects", "leaderboard", "chat", "utilityCatalog", "objectInstance", "serverTime"]) {
    assert.ok(!(hot in header), `the header carries no ${hot}`);
  }
  assert.equal((await watcher.c.query(api.games.header, { code: game.gameId })).shortCode, game.shortCode, "by id too");

  // ---- the instance and catalog (static for the game) ------------------------------------------------------------
  const instance = await watcher.c.query(api.games.instance, { gameId: game.gameId });
  assert.equal(instance.objectInstance.key, "Int(-2147483648,2147483647)");
  assert.ok(Array.isArray(instance.utilityCatalog) && instance.utilityCatalog.length > 0, "the game's utility catalog");

  // ---- standings at the start: the first scoreboard, ranked -------------------------------------------------------
  const roster: string[] = (await raw(game.gameId)).game.roster.map((m: any) => m.id);
  const first = (await raw(game.gameId)).game.scoreboard;
  const standingsOf = async () => watcher.c.query(api.games.standings, { gameId: game.gameId });
  const s0 = await standingsOf();
  assert.equal(s0.world, 0);
  assert.equal(s0.agentCount, 0);
  const expected = rankTotals(roster, first.totals);
  assert.deepEqual(s0.rows.map((r: any) => [r.deityId, r.rank, r.totalPayoff]), expected.map(r => [r.godId, r.rank, r.totalPayoff]),
    "the standings are the published scoreboard, ranked (hand: rankTotals of the scoreboard's totals)");
  assert.ok(s0.rows.every((r: any) => typeof r.name === "string" && (r.kind === "human" || r.kind === "ai")));
  const h0 = await watcher.c.query(api.games.standingsHistory, { gameId: game.gameId });
  assert.deepEqual(h0.rows.map((r: any) => [r.world, r.totals]), [[0, first.totals]], "one history row per publication: the start's");

  // ---- run the world: publications every 2 world seconds ---------------------------------------------------------
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Spec agent", language: "typescript", source: "function agent(x) { return [add(3)]; }" }, game.gameId) });
    assert.equal(r.accepted, true, r.message);
  }
  // Catches: an agent count that waits for the next publication (in planning, none comes).
  assert.equal((await standingsOf()).agentCount, 2, "summons show at once, between publications");
  assert.deepEqual((await watcher.c.query(api.games.standingsHistory, { gameId: game.gameId })).rows.map((r: any) => r.seq), [0], "a summon publishes nothing");
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await say("During the game", game.gameId);
  const history = await waitFor(async () => {
    const h = await watcher.c.query(api.games.standingsHistory, { gameId: game.gameId });
    return h.rows.length >= 4 && h;
  }, "four publications", 60_000, 250);
  const worlds = history.rows.map((r: any) => r.world);
  assert.deepEqual(worlds, [...worlds].sort((a, b) => a - b), "history in publication order");
  assert.equal(new Set(history.rows.map((r: any) => r.seq)).size, history.rows.length, "no publication twice");
  // Each publication after the start crosses a multiple of the interval (hand: floor(world / 2) grows).
  for (let i = 1; i < worlds.length; i++) assert.ok(Math.floor(worlds[i] / 2) > Math.floor(worlds[i - 1] / 2), `publication ${i} at ${worlds[i]}`);
  // The cursor: rows after a seq, never the ones before.
  const after = await watcher.c.query(api.games.standingsHistory, { gameId: game.gameId, after: history.rows[1].seq });
  assert.equal(after.rows[0].seq, history.rows[2].seq, "the row right after the cursor comes first");
  assert.ok(after.rows.every((r: any) => r.seq > history.rows[1].seq), "never a row at or before the cursor");

  // Standings = the latest publication, consistent with the clock's scoreboard (retry across a publication between reads).
  await waitFor(async () => {
    const s = await standingsOf();
    const board = (await raw(game.gameId)).game.scoreboard;
    if (s.world !== board.world) return false;
    assert.deepEqual(s.rows.map((r: any) => [r.deityId, r.rank, r.totalPayoff]), rankTotals(roster, board.totals).map(r => [r.godId, r.rank, r.totalPayoff]));
    assert.equal(s.agentCount, 2, "two live agents, published with the scoreboard");
    return true;
  }, "standings = the latest scoreboard", 20_000, 100);

  // ---- the skeleton: a page of ids by disclosed salience, highest first --------------------------------------------
  const secret = await raw(game.gameId);
  const page = await watcher.c.query(api.games.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 10, cursor: null } });
  assert.equal(page.page.length, 10);
  assert.ok(page.page.every((r: any) => Object.keys(r).sort().join() === "id,salience"), "the skeleton returns ids and the sort key only");
  const keys = page.page.map((r: any) => r.salience);
  assert.deepEqual(keys, [...keys].sort((a, b) => b - a), "highest disclosed salience first");
  const next = await watcher.c.query(api.games.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 10, cursor: page.continueCursor } });
  assert.ok(next.page.every((r: any) => r.salience <= keys.at(-1)! && !page.page.some((p: any) => p.id === r.id)), "the next page continues below");
  const huge = await watcher.c.query(api.games.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 5000, cursor: null } });
  assert.ok(huge.page.length <= 50, "a page is capped server-side");

  // ---- one object row: live, the salience carries the value's disclosure noise -------------------------------------
  const noisy = secret.objects.find((o: any) => o.noise);
  assert.ok(noisy, "the default settings add disclosure noise");
  const row = await waitFor(async () => {
    const r = await watcher.c.query(api.games.object, { objectId: noisy._id });
    const now = (await raw(game.gameId)).objects.find((o: any) => o._id === noisy._id);
    return r.version === now.version && { r, now };
  }, "a stable read of one object", 20_000, 100);
  assert.deepEqual(Object.keys(row.r).sort(), ["id", "salience", "value", "version"]);
  assert.ok(close(row.r.salience, row.now.salience + row.now.noise), "live: Σ net bits + the value's noise (hand: stored salience + noise)");

  // ---- chat: the game's own window, newest first, paged -------------------------------------------------------------
  const chat = await watcher.c.query(api.rooms.chat, { roomId, gameId: game.gameId, paginationOpts: { numItems: 10, cursor: null } });
  assert.deepEqual(chat.page.map((m: any) => m.text), ["During the game"], "the game's chat, not the room's earlier chat");
  const roomChat = await watcher.c.query(api.rooms.chat, { roomId, paginationOpts: { numItems: 1, cursor: null } });
  assert.deepEqual(roomChat.page.map((m: any) => m.text), ["During the game"], "newest first, one per page");
  assert.equal(roomChat.isDone, false);

  // ---- the end: exact salience, final standings -------------------------------------------------------------------
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const ended = await raw(game.gameId);
  const endedHeader = await watcher.c.query(api.games.header, { code: game.shortCode });
  assert.equal(endedHeader.status, "ended");
  assert.deepEqual(endedHeader.winners.map((w: any) => w.deityId).sort(), ended.game.summary.winners.map((w: any) => w.deityId).sort());
  const final = await standingsOf();
  assert.equal(final.world, ended.game.scoreboard.world);
  assert.deepEqual(final.rows.map((r: any) => r.totalPayoff), rankTotals(roster, ended.game.scoreboard.totals).map(r => r.totalPayoff), "the end's exact scoreboard");
  await waitFor(async () => {
    const r = await watcher.c.query(api.games.object, { objectId: noisy._id });
    const o = ended.objects.find((x: any) => x._id === noisy._id);
    return close(r.salience, o.salience);
  }, "ended: the exact salience", 20_000, 250);
  const endedChat = await watcher.c.query(api.rooms.chat, { roomId, gameId: game.gameId, paginationOpts: { numItems: 10, cursor: null } });
  assert.deepEqual(endedChat.page.map((m: any) => m.text), ["During the game"]);
});

test("spectator queries keep the game's access rules: a past game is its players', spectators' and owner's only", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Spec Acc Host", "Spec Acc Ada", "Spec Acc Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...settings, startingObjectCount: 3 });
  const g1 = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await startGame(host, roomId);
  const [stranger] = await gods("Spec Acc Stranger");
  const objectId = (await raw(g1.gameId)).objects[0]._id;
  for (const [label, call] of [
    ["header", () => stranger.c.query(api.games.header, { code: g1.shortCode })],
    ["standings", () => stranger.c.query(api.games.standings, { gameId: g1.gameId })],
    ["history", () => stranger.c.query(api.games.standingsHistory, { gameId: g1.gameId })],
    ["instance", () => stranger.c.query(api.games.instance, { gameId: g1.gameId })],
    ["objectIds", () => stranger.c.query(api.games.objectIds, { gameId: g1.gameId, paginationOpts: { numItems: 5, cursor: null } })],
    ["object", () => stranger.c.query(api.games.object, { objectId })],
  ] as const) assert.match(await rejects(call()), /played in it/, `a stranger cannot read a past game's ${label}`);
  assert.equal((await ada.c.query(api.games.standings, { gameId: g1.gameId })).rows.length, 3, "its player can");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
