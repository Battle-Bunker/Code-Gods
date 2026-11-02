/**
 * The hot reactive queries cost the same in a room with a long history as in a fresh one. Every client subscribes to
 * them and they re-execute on every change they read, so their cost is paid per subscriber per change: a read that grew
 * with the room's past games, its event log or its chat would slow every live game in an old room, and the multi-client
 * e2e once came within 100 ms of Convex's 1 s query limit on rooms.get.
 *
 * Two rooms with the same members and settings, each with a game in planning: a fresh one, and one whose past holds
 * two real ended games (agents acting, chat) cloned to forty, with thousands of logged events. Each hot query runs
 * once uncached in each room; the backend's own execution log (the admin log stream `npx convex logs` reads) gives the
 * documents and bytes each execution read, and its time.
 *
 * What would break: a query (or a helper it calls) that scans the room's games, the event log or chat without a bound
 * index range, or .collect()s a growing table. Module weight (load time on every execution) is guarded by
 * test/unit/hot-query-bundles.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_KEY, URL_, admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, TS, waitFor, type God } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 1, interactionRateHz: 20, planningSeconds: 3600,
  halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};

/** A query's execution as the backend logged it. */
type Execution = { identifier: string; cachedResult: boolean; executionTime: number; usageStats: { databaseReadDocuments: number; databaseReadBytes: number } };
async function logPage(cursor: number): Promise<{ entries: Execution[]; newCursor: number }> {
  const response = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } });
  assert.equal(response.status, 200, "the admin log stream answers");
  return response.json();
}
/** The uncached executions of `queries` (identifiers like "rooms:get") while `run` runs, one per query. */
async function executionsOf(queries: string[], run: () => Promise<unknown>): Promise<Map<string, Execution>> {
  let { newCursor: cursor } = await logPage(0);
  await run();
  const found = new Map<string, Execution>();
  await waitFor(async () => {
    const page = await logPage(cursor);
    cursor = page.newCursor;
    for (const e of page.entries) if (queries.includes(e.identifier) && !e.cachedResult && !found.has(e.identifier)) found.set(e.identifier, e);
    return found.size === queries.length;
  }, `the execution log shows ${queries.join(", ")}`, 30_000, 250);
  return found;
}

/** Each hot query of a player's client, once, as `god` in `roomId` (a fresh room and args: never a cached result). */
const HOT: Record<string, (god: God, roomId: string, gameId: string) => Promise<unknown>> = {
  "rooms:get": (god, roomId) => god.c.query(api.rooms.get, { room: roomId }),
  "player:observation": (god, roomId) => god.c.query(api.player.observation, { roomId }),
  "player:events": (god, roomId) => god.c.query(api.player.events, { roomId, limit: 200 }),
  "player:myUtility": (god, roomId) => god.c.query(api.player.myUtility, { roomId }),
  "layout:current": (god, roomId) => god.c.query(api.layout.current, { roomId }),
  "assistant:status": (god, roomId) => god.c.query(api.assistant.status, { roomId }),
  "assistant:transcript": (god, roomId, gameId) => god.c.query(api.assistant.transcript, { roomId, gameId }),
};

test("the hot queries read and cost no more in a room with forty past games than in a fresh room", { timeout: 300_000 }, async () => {
  const [host, ada, bo] = await gods("Perf Host", "Perf Ada", "Perf Bo");
  await touch(host);
  const old = await roomWith([host, ada, bo], settings);
  const fresh = await roomWith([host, ada, bo], settings);

  // Two real games in the old room: agents acting on the objects, chat, an owner end.
  const played: string[] = [];
  for (let g = 0; g < 2; g++) {
    const game = await startGame(host, old.roomId);
    const send = (god: God, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId: old.roomId, envelope: envelope(command, game.gameId) });
    for (const god of [ada, bo]) assert.equal((await send(god, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
    await send(ada, { type: "chat", text: `game ${g}` });
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
    await waitFor(async () => (await raw(game.gameId)).batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "transform").length >= 60,
      `game ${g} logs 60 transformations`, 120_000, 500);
    await send(bo, { type: "chat", text: `still game ${g}` });
    await host.c.mutation(api.rooms.endActiveGame, { roomId: old.roomId });
    played.push(game.gameId);
  }
  let events = 0, batches = 0;
  for (const gameId of played) for (let i = 0; i < 4; i++) {
    const copied = await admin.mutation(internal.testing.cloneEndedGame, { gameId, copies: 5 });
    events += copied.events * copied.games; batches += copied.batches * copied.games;
  }
  assert.ok(events >= 2_000, `the old room's past holds thousands of object events (${events}, in ${batches} tick batches)`);

  // Both rooms' chat windows full: rooms.get carries the room's 100 latest messages by design (a bounded read), so the
  // fresh room gets as many as the old one has more than.
  for (const { roomId } of [old, fresh]) {
    await admin.mutation(internal.testing.seedChat, { roomId, authorId: host.subject, texts: Array.from({ length: 120 }, (_, i) => `filler ${i}`), timestamp: Date.now() });
  }
  // The game each room plays now: in planning, no agents, so both rooms hold the same live state.
  const now = { [old.roomId]: (await startGame(host, old.roomId)).gameId, [fresh.roomId]: (await startGame(host, fresh.roomId)).gameId };
  // One at a time, so each time is the query's own and not the machine's contention.
  const measure = (roomId: string) => executionsOf(Object.keys(HOT), async () => { for (const q of Object.values(HOT)) await q(ada, roomId, now[roomId]); });
  const inFresh = await measure(fresh.roomId), inOld = await measure(old.roomId);

  const rows = Object.keys(HOT).map(query => {
    const f = inFresh.get(query)!, o = inOld.get(query)!;
    const line = `${query}: ${o.usageStats.databaseReadDocuments} documents (${o.usageStats.databaseReadBytes} B) in ${Math.round(o.executionTime * 1000)} ms with history, ` +
      `${f.usageStats.databaseReadDocuments} (${f.usageStats.databaseReadBytes} B) in ${Math.round(f.executionTime * 1000)} ms fresh`;
    console.log(line);
    return { f, o, line };
  });
  for (const { f, o, line } of rows) {
    // Same members, settings, chat window and live game: the reads may differ by a few documents (the room's last
    // game), never with the size of the history.
    assert.ok(o.usageStats.databaseReadDocuments <= f.usageStats.databaseReadDocuments + 3, `reads grow with history: ${line}`);
    assert.ok(o.usageStats.databaseReadBytes <= f.usageStats.databaseReadBytes * 1.5 + 8_192, `bytes read grow with history: ${line}`);
    // Tens of milliseconds on an idle machine, module load included (the reads above are the exact check; time is noisy):
    // half of Convex's 1 s query limit, which the multi-client e2e once came within 100 ms of.
    assert.ok(o.executionTime < 0.5, `too slow: ${line}`);
  }
});
