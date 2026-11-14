/**
 * The v2 query-cost gate (docs/convex-read-architecture.md R8, integration plan §5.2): in a 1,000-object game every
 * live v2 query a page subscribes to (test/v2-query-budgets.ts) reads at most 100 documents and 64 KiB, runs in at
 * most 50 ms of user code (median of 10 uncached runs, measured by the backend's execution log), and refuses a
 * signed-out caller. A query over its time is measured once more and fails only if it is over again.
 *
 * What would break: a page query that grows with the world, or a new page query without a budget row.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, anonymous, executionLog, humans, type Human } from "./v2-helpers.ts";
import { LIMITS, V2_BUDGETS, type V2Fixture } from "./v2-query-budgets.ts";

const RUNS = 10;
let player: Human, fixture: V2Fixture;

before(async () => {
  const [ada, bo, cy] = await humans("Gate Ada", "Gate Bo", "Gate Cy");
  player = ada!;
  const seeded = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId, cy!.userId], objects: 1000 });
  const agentId = (await ada!.query("v2/play:agents", { gameId: seeded.gameId }))[0].agentId;
  fixture = { roomId: seeded.roomId, gameId: seeded.gameId, objectId: seeded.objects[500], agentId };
}, { timeout: 120_000 });

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function measure(queries: readonly (typeof V2_BUDGETS)[number][]) {
  const log = await executionLog();
  try {
    for (const b of queries) for (let i = 0; i < RUNS; i++) await player.withClaim(`gate-${randomUUID()}`).query(b.query, b.args(fixture));
    const uncached = (of: (id: string) => any[], q: string) => of(q).filter(e => e.caller === "HttpApi" && !e.cachedResult);
    await log.until(of => queries.every(b => uncached(of, b.query).length >= RUNS), `${RUNS} uncached runs of each query`);
    return new Map(queries.map(b => {
      const runs = uncached(log.of, b.query).slice(-RUNS);
      return [b.query, {
        docs: Math.max(...runs.map(e => e.usageStats.databaseReadDocuments)), bytes: Math.max(...runs.map(e => e.usageStats.databaseReadBytes)),
        ms: median(runs.map(e => (e.userExecutionTime ?? e.executionTime) * 1000)),
      }];
    }));
  } finally { await log.stop(); }
}

test("every v2 page query stays within R8's reads and time in a 1,000-object game", { timeout: 300_000 }, async () => {
  const first = await measure(V2_BUDGETS);
  const slow = V2_BUDGETS.filter(b => first.get(b.query)!.ms > LIMITS.ms);
  const again = slow.length ? await measure(slow) : new Map();
  const problems: string[] = [], table: string[] = [];
  for (const b of V2_BUDGETS) {
    const m = first.get(b.query)!, ms = again.get(b.query)?.ms ?? m.ms;
    table.push(`${b.query.padEnd(28)} ${String(m.docs).padStart(4)} docs ${String(Math.round(m.bytes / 1024 * 10) / 10).padStart(6)} KiB ${ms.toFixed(1).padStart(6)} ms`);
    if (m.docs > LIMITS.docs) problems.push(`${b.query} read ${m.docs} documents (limit ${LIMITS.docs})`);
    if (m.bytes > LIMITS.bytes) problems.push(`${b.query} read ${m.bytes} bytes (limit ${LIMITS.bytes})`);
    if (ms > LIMITS.ms) problems.push(`${b.query} took ${ms.toFixed(1)} ms (limit ${LIMITS.ms})`);
  }
  console.log(table.join("\n"));
  assert.deepEqual(problems, []);
});

test("every v2 page query refuses a signed-out caller", async () => {
  for (const b of V2_BUDGETS) {
    let code = "answered";
    try { await anonymous.query(b.query, b.args(fixture)); } catch (e) { code = (e as { data?: { code?: string } }).data?.code ?? "untyped"; }
    assert.equal(code, "UNAUTHENTICATED", b.query);
  }
});
