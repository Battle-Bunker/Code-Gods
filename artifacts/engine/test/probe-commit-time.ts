/**
 * Probe (not a test): the tick commit's time in a running 1,000-object game with three gods acting at
 * interactionRateHz 100, the case the per-god object read model must not slow (read-architecture §6 PR 4: the first
 * attempt took the commit from 298 to 667 ms). It reads the backend's execution log for every `engine/loop:commit`
 * mutation over a measured window and prints the median, p90 and mean execution time, the commit's round trip as the
 * tick action saw it (tickBatches.perf.commitMs) and the acts per commit.
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning test/probe-commit-time.ts [seconds=60] [agentsPerGod=8]
 *
 * Each agent is offered at most MAX_AGENT_OPPORTUNITY_HZ (4) opportunities a second, so 8 agents per god let three gods
 * take most of the 100 opportunities a second. Run against an otherwise idle local backend (one backend-heavy run per
 * machine): the numbers are only comparable between runs on the same machine under the same load.
 */
import assert from "node:assert/strict";
import { ADMIN_KEY, URL_, admin, api, envelope, gods, internal, roomWith, startGame, touch, waitFor, TS } from "./game-helpers.ts";

const seconds = Number(process.argv[2] ?? 60), perGod = Number(process.argv[3] ?? 8);
const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 1000, spawnRateHz: 0, interactionRateHz: 100, planningSeconds: 0,
  halfLifeSeconds: 1e9, powerPerSecond: 2000, startingEnergy: 100000,
};

type Entry = { identifier?: string; udfType?: string; kind?: string; executionTime?: number; error?: unknown };
async function page(cursor: number): Promise<{ entries: Entry[]; newCursor: number }> {
  const r = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } });
  assert.equal(r.status, 200);
  return r.json();
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const [ada, bo, cy] = await gods("Probe Ada", "Probe Bo", "Probe Cy");
await touch(ada);
const { roomId } = await roomWith([ada, bo, cy], settings);
const { gameId } = await startGame(ada, roomId);
for (const god of [ada, bo, cy]) for (let i = 0; i < perGod; i++) {
  const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: `Probe agent ${i}`, language: "typescript", source: TS.Int }, gameId) });
  assert.equal(r.accepted, true, r.message);
}
await waitFor(async () => {
  const c = await admin.query(internal.testing.gameCounters, { gameId });
  return c?.phase === "running" && c.objectCount >= 1000 && c.worldSeconds > 20;
}, "the game runs with 1,000 objects", 180_000, 500);

let { newCursor: cursor } = await page(0);
const times: number[] = [], syncs: number[] = [], fills: number[] = [], errors = new Map<string, number>();
const from = Date.now(), until = from + seconds * 1000;
while (Date.now() < until) {
  await new Promise(r => setTimeout(r, 200));
  const p = await page(cursor);
  cursor = p.newCursor;
  for (const e of p.entries) {
    if (e.kind !== undefined && e.kind !== "Completion") continue;
    const id = e.identifier ?? "";
    // Failed executions (an OCC conflict that gave up, a thrown error) of the commit and the read-model writers.
    if (e.error && /(engine\/loop(\.js)?:commit|objectViews(\.js)?:\w+)$/.test(id)) {
      const k = `${id}: ${String(e.error).slice(0, 80)}`;
      errors.set(k, (errors.get(k) ?? 0) + 1);
      continue;
    }
    if (e.udfType === "Mutation" && /engine\/loop(\.js)?:commit$/.test(id) && typeof e.executionTime === "number") times.push(e.executionTime * 1000);
    if (/objectViews(\.js)?:sync$/.test(id) && typeof e.executionTime === "number") syncs.push(e.executionTime * 1000);
    if (/objectViews(\.js)?:(fill|fillTotals)$/.test(id) && typeof e.executionTime === "number") fills.push(e.executionTime * 1000);
  }
}
const counters = await admin.query(internal.testing.gameCounters, { gameId });
const { batches } = await admin.query(internal.testing.rawGame, { gameId });
await ada.c.mutation(api.rooms.endActiveGame, { roomId });
const perf = (batches as { at: number; perf?: { acts: number; commitMs?: number } }[]).filter(b => b.at >= from && b.at <= until && b.perf).map(b => b.perf!);
const trips = perf.map(p => p.commitMs).filter((t): t is number => t !== undefined);
times.sort((a, b) => a - b);
console.log(JSON.stringify({
  commits: times.length, medianMs: Math.round(median(times)), p90Ms: Math.round(times[Math.floor(0.9 * times.length)]),
  meanMs: Math.round(times.reduce((s, t) => s + t, 0) / Math.max(1, times.length)),
  syncs: syncs.length, syncMedianMs: syncs.length ? Math.round(median(syncs)) : null,
  // Everything the read model costs per commit: the syncs and the sweeps (fill pages), over the commits measured.
  readModelMsPerCommit: Math.round((syncs.reduce((s, t) => s + t, 0) + fills.reduce((s, t) => s + t, 0)) / Math.max(1, times.length)),
  syncMsPerCommit: Math.round(syncs.reduce((s, t) => s + t, 0) / Math.max(1, times.length)),
  sweepMsPerCommit: Math.round(fills.reduce((s, t) => s + t, 0) / Math.max(1, times.length)),
  fills: fills.length, fillMedianMs: fills.length ? Math.round(median(fills)) : null, errors: Object.fromEntries(errors),
  roundTripMedianMs: trips.length ? Math.round(median(trips)) : null,
  actsPerCommit: Math.round(perf.reduce((s, p) => s + p.acts, 0) / Math.max(1, perf.length)), counters,
}));
process.exit(0);
