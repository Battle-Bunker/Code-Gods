/**
 * The query-cost gate (docs/convex-read-architecture.md R8), driven by the budget table test/query-budgets.ts.
 *
 * One running game with 1,000 objects, three players with an agent each, a stored panel and a pending device request.
 * For every query a page subscribes to:
 *   1. reads: the most documents and bytes any of 10 uncached executions read (deterministic);
 *   2. time: the median user-code time of those 10 executions. Each run is uncached legitimately: Convex keys its
 *      query cache by the caller's identity, so each run is the same human with a fresh token claim (`gate`), which is
 *      what a new browser session or a refreshed JWT is;
 *   3. cold queries: the same caller asks twice with 5 tick commits in between, and the backend's log must show the
 *      second answer served from the cache (a commit that wrote a document the query read would have invalidated it:
 *      read-architecture §1.5, measured);
 *   4. a caller who is not signed in is refused (owner decision 2026-11-02), except the rows decided open.
 * The numbers come from the backend's execution log (test/execution-log.ts), never from client timings.
 *
 * What would break: a page query that grows with the world or reads a hot document for a cold answer; a new page
 * query without a budget row (test/unit/query-budgets.test.ts); a known-debt row that a fix paid off but that still
 * holds its ceiling (the gate asks for its removal, so the debt list only shrinks).
 */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { SITE_, URL_, admin, api, clientFor, envelope, gods, internal, roomWith, startGame, touch, TS, waitFor, type God } from "./game-helpers.ts";
import { executionLog, type Execution } from "./execution-log.ts";
import { BUDGETS, LIMITS, refOf, type Budget, type Fixture } from "./query-budgets.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 1000, spawnRateHz: 1, interactionRateHz: 20, planningSeconds: 0,
  halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};
const RUNS = 10;
const COMMITS = 5;
const panel = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Gate", placement: "left", Component() { return <p>gate</p>; } });\n`;

const ref = (identifier: string) => refOf(api, identifier) as any;

let fixture: Fixture;
let player: God, siteAdmin: God, gameId: string;
/** `who` with a token claim of its own: its own query-cache key. */
const caller = (b: Budget, claim: string) => {
  const god = b.as === "admin" ? siteAdmin : player;
  return clientFor(god.subject, "browser", { sessionId: god.sid, gate: claim });
};
const commits = async () => (await admin.query(internal.testing.gameCounters, { gameId }))!.commits as number;

before(async () => {
  const [ada, bo, cy] = await gods("Gate Ada", "Gate Bo", "Gate Cy");
  const subject = `test|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name: "Gate Admin", email: "admin@example.test", emailVerified: true, provider: "fake" });
  siteAdmin = { subject, name: "Gate Admin", sid, c: clientFor(subject, "browser", { sessionId: sid }) };
  player = ada;
  await touch(ada);
  const { roomId, shortCode } = await roomWith([ada, bo, cy], settings);
  const room = await ada.c.query(api.rooms.get, { room: roomId });
  const saved = await ada.c.action(api.panels.save, { slug: "gate", source: panel });
  assert.equal(saved.ok, true, `the gate's panel saves: ${JSON.stringify(saved)}`);
  const device = await fetch(`${SITE_}/api/device/request`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ room: shortCode, challenge: "g".repeat(43), label: "Gate device" }) });
  assert.equal(device.status, 200, "the device request is pending");
  const { userCode } = await device.json();

  // An ended game of the same players, with its stored replay (replays:stored).
  const ended = await roomWith([ada, bo, cy], { ...settings, startingObjectCount: 3 });
  const endedGame = await startGame(ada, ended.roomId);
  await ada.c.mutation(api.rooms.endActiveGame, { roomId: ended.roomId });
  await waitFor(async () => (await ada.c.query(api.replays.stored, { roomId: ended.roomId, gameId: endedGame.gameId })).stored, "the ended game's stored replay", 60_000, 250);

  const game = await startGame(ada, roomId);
  gameId = game.gameId;
  let commandId = "";
  for (const god of [ada, bo, cy]) {
    const summon = envelope({ type: "summon", name: "Gate agent", language: "typescript", source: TS.Int }, gameId);
    const summoned = await god.c.action(api.commands.submit, { roomId, envelope: summon });
    assert.equal(summoned.accepted, true, `${god.name} summons: ${summoned.message}`);
    if (god === ada) commandId = summon.commandId;
  }
  await waitFor(async () => {
    const c = await admin.query(internal.testing.gameCounters, { gameId });
    return c?.phase === "running" && c.objectCount >= 1000 && c.worldSeconds > 2;
  }, "the game runs with 1,000 objects", 120_000, 500);
  fixture = { roomId, roomCode: shortCode, gameId, gameCode: game.shortCode, setupId: room.setup.id, panelSlug: "gate", userCode, commandId,
    endedRoomId: ended.roomId, endedGameId: endedGame.gameId };
});

type Measured = { budget: Budget; docs: number; bytes: number; ms: number; runs: Execution[] };
let measured: Measured[] = [];

test("every page query fits its budget: documents, bytes and time in a running 1,000-object game", { timeout: 600_000 }, async () => {
  const log = await executionLog();
  for (const b of BUDGETS) {
    for (let i = 0; i < RUNS; i++) {
      const run = `run-${i}-${randomUUID()}`;
      try { await caller(b, run).query(ref(b.query), b.args(fixture, run)); } catch (error) {
        assert.fail(`${b.query} failed for the gate's caller: ${(error as Error).message}`);
      }
    }
  }
  // The gate's own calls (over HTTP), uncached.
  const uncached = (of: (id: string) => Execution[], q: string) => of(q).filter(e => e.caller === "HttpApi" && !e.cachedResult);
  await log.until(of => BUDGETS.every(b => uncached(of, b.query).length >= RUNS), `${RUNS} uncached runs of every budgeted query`)
    .catch(error => assert.fail(`${(error as Error).message}; short: ${BUDGETS.filter(b => uncached(log.of, b.query).length < RUNS).map(b => `${b.query} ${uncached(log.of, b.query).length}`).join(", ")}`));
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), h = s.length / 2; return (s[Math.floor(h - 0.5)] + s[Math.ceil(h - 0.5)]) / 2; };
  /** User-code time in ms; the log must carry it, or the time budget would pass unmeasured. */
  const userMs = (e: Execution) => { assert.equal(typeof e.userExecutionTime, "number", `${e.identifier}: the log gives its user time`); return e.userExecutionTime! * 1000; };
  measured = BUDGETS.map(budget => {
    const runs = uncached(log.of, budget.query).slice(0, RUNS);
    return {
      budget, runs,
      docs: Math.max(...runs.map(r => r.usageStats.databaseReadDocuments)),
      bytes: Math.max(...runs.map(r => r.usageStats.databaseReadBytes)),
      ms: median(runs.map(userMs)),
    };
  });
  console.log(["query | docs | KiB | median user ms | budget", ...[...measured].sort((a, b) => b.docs - a.docs).map(m =>
    `${m.budget.query} | ${m.docs} | ${(m.bytes / 1024).toFixed(1)} | ${m.ms.toFixed(1)} | ${m.budget.debt ? `debt (${m.budget.debt.why})` : "R8"}`)].join("\n"));

  const problems: string[] = [];
  for (const m of measured) {
    const { query, debt } = m.budget;
    const docs = debt?.docs ?? LIMITS.docs, bytes = debt?.bytes ?? LIMITS.bytes, ms = debt?.ms ?? LIMITS.ms;
    if (m.docs > docs) problems.push(`${query} read ${m.docs} documents (budget ${docs})`);
    if (m.bytes > bytes) problems.push(`${query} read ${m.bytes} bytes (budget ${bytes})`);
    if (m.ms > ms) problems.push(`${query} took a median ${m.ms.toFixed(1)} ms of user code (budget ${ms})`);
    // Paid-off debt is removed, so the list only shrinks (time is noisy: only the read ceilings are checked).
    if (!debt?.capped && debt?.docs !== undefined && m.docs <= LIMITS.docs && (debt.bytes === undefined || m.bytes <= LIMITS.bytes))
      problems.push(`${query} now reads ${m.docs} documents (${m.bytes} bytes), within R8: remove its docs/bytes debt`);
    if (!debt?.capped && debt?.bytes !== undefined && debt.docs === undefined && m.bytes <= LIMITS.bytes)
      problems.push(`${query} now reads ${m.bytes} bytes, within R8: remove its bytes debt`);
  }
  assert.deepEqual(problems, []);
});

test(`a cold page query is still cached after ${COMMITS} tick commits`, { timeout: 120_000 }, async () => {
  const cold = BUDGETS.filter(b => b.cold);
  const log = await executionLog();
  const claim = `cold-${randomUUID()}`;
  const ask = async () => { for (const b of cold) await caller(b, claim).query(ref(b.query), b.args(fixture, claim)); };
  await ask();
  const from = await commits();
  await waitFor(async () => (await commits()) >= from + COMMITS, `${COMMITS} tick commits`, 60_000, 250);
  await ask();
  // The gate's own calls (over HTTP), not a browser's subscription that may run the same query meanwhile.
  const mine = (of: (id: string) => Execution[], q: string) => of(q).filter(e => e.caller === "HttpApi");
  await log.until(of => cold.every(b => mine(of, b.query).length >= 2), "both calls of every cold query");
  const problems: string[] = [];
  const report: string[] = [];
  for (const b of cold) {
    const [first, second] = mine(log.of, b.query);
    if (first.cachedResult) problems.push(`${b.query}: the first call was answered from the cache (its cache key is not the caller's)`);
    const invalidated = !second.cachedResult;
    report.push(`${b.query}: ${invalidated ? "re-executed" : "cached"}`);
    if (invalidated && !b.debt?.invalidatedByTick) problems.push(`${b.query} re-executed across ${COMMITS} tick commits: it reads a document the tick writes`);
    if (!invalidated && b.debt?.invalidatedByTick) problems.push(`${b.query} stayed cached across ${COMMITS} tick commits: remove its invalidatedByTick debt`);
  }
  console.log(report.join("\n"));
  assert.deepEqual(problems, []);
});

test("every page query refuses a caller who is not signed in, except those decided open", { timeout: 60_000 }, async () => {
  const anonymous = new ConvexHttpClient(URL_);
  const problems: string[] = [];
  for (const b of BUDGETS) {
    let refused: string | undefined;
    try { await anonymous.query(ref(b.query), b.args(fixture, `anonymous-${randomUUID()}`)); } catch (error) {
      refused = error instanceof ConvexError ? String((error.data as { code?: string })?.code) : `untyped: ${(error as Error).message.split("\n")[0]}`;
    }
    if (b.open && refused) problems.push(`${b.query} is decided open but refused a signed-out caller (${refused})`);
    if (!b.open && refused !== "UNAUTHENTICATED") problems.push(`${b.query} ${refused ? `refused with ${refused}, not UNAUTHENTICATED` : "answered a signed-out caller"}`);
  }
  assert.deepEqual(problems, []);
});
