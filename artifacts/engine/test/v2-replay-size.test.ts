/**
 * The end of long games at realistic size (playtest round 8: queries timed out at 1 s when two five-minute games
 * ended together): three ended games of 2,000 Grids-sized events (6 KB each, about 12 MB a record) build their
 * replays at once, while their players read their act logs. Every build stores the whole record, every page of the
 * build stays far inside the 1 s query limit, and an act-log page answers meanwhile.
 *
 * What would break: a replay page that reads a fixed number of events whatever their size (1.2 MB per page), or a
 * build that crowds out the queries players make at the end of a game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, executionLog, httpJwt, humans, SITE_ } from "./v2-helpers.ts";

const GAMES = 3, EVENTS = 2000, BYTES = 6000, BATCH = 100;

test("three long games build their replays together while their players read", { timeout: 600_000 }, async () => {
  const players = await humans(...Array.from({ length: GAMES }, (_, i) => `Size ${i}`));
  const games: string[] = [];
  for (const p of players) {
    const [bo, cy] = await humans(`${p!.userId} Bo`, `${p!.userId} Cy`);
    const seeded = await admin.mutation("v2/testing:seedGame", { owner: p!.userId, humans: [bo!.userId, cy!.userId], objects: 40, moves: 60, phase: "ended" });
    // Paced under the local backend's write limit (4 MiB/s): 600 KB a batch, five a second.
    for (let n = 0; n < EVENTS; n += BATCH) { await admin.mutation("v2/testing:bulkEvents", { gameId: seeded.gameId, count: BATCH, bytes: BYTES }); await new Promise(r => setTimeout(r, 200)); }
    games.push(seeded.gameId);
  }
  const total = await Promise.all(games.map(async g => (await admin.query("v2/testing:events", { gameId: g, after: -1 })).length));
  assert.ok(total.every(n => n === 200), "the seeded records hold more than a page");

  const log = await executionLog();
  try {
    for (const g of games) await admin.mutation("v2/testing:buildReplay", { gameId: g });
    // The players read their act logs while the builds run.
    const reads = await Promise.all(players.map((p, i) => p!.query("v2/play:moves", { gameId: games[i], paginationOpts: { numItems: 200, cursor: null } })));
    for (const r of reads) assert.ok(r.page.length > 0 && r.page.length <= 50, `a bounded page: ${r.page.length}`);
    for (const [i, g] of games.entries()) {
      for (let k = 0; !(await players[i]!.query("v2/replays:stored", { gameId: g })).stored; k++) {
        assert.ok(k < 600, "the replay file is built");
        await new Promise(r => setTimeout(r, 500));
      }
    }
    const pages = log.of("v2/replays:events").filter(e => e.caller !== "HttpApi");
    assert.ok(pages.length > 0, "the build's pages ran");
    assert.deepEqual(pages.filter(e => (e as any).error), [], "no build page failed");
    const slowest = Math.max(...pages.map(e => e.executionTime * 1000));
    assert.ok(slowest < 500, `every build page well inside the 1 s limit: slowest ${slowest.toFixed(0)} ms`);
    const biggest = Math.max(...pages.map(e => e.usageStats.databaseReadBytes));
    assert.ok(biggest < 512 * 1024, `a page reads about its byte budget: ${biggest}`);
  } finally { await log.stop(); }

  for (const [i, g] of games.entries()) {
    const file = await (await fetch(`${SITE_}/api/v2/replay/${g}`, { headers: { authorization: `Bearer ${await httpJwt(players[i]!.userId)}` } })).json();
    const seqs = file.events.map((e: any) => e.seq);
    assert.ok(seqs.length >= EVENTS, `every event: ${seqs.length}`);
    assert.deepEqual(seqs, seqs.map((_: number, k: number) => k), "dense and in order");
  }
});
