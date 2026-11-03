// Scratch probe (not committed): the tick commit's cost in a running 1,000-object game with three agents.
import test from "node:test";
import { ADMIN_KEY, URL_, admin, api, envelope, gods, internal, roomWith, startGame, touch, TS, waitFor, sleep } from "./game-helpers.ts";
const settings = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 1000, spawnRateHz: 1, interactionRateHz: 100, planningSeconds: 0, halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000 };
async function page(cursor: number) { const r = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } }); return r.json() as any; }
test("commit probe", { timeout: 600_000 }, async () => {
  const [a, b, c] = await gods("Probe A", "Probe B", "Probe C");
  await touch(a);
  const { roomId } = await roomWith([a, b, c], settings);
  const game = await startGame(a, roomId);
  for (const g of [a, b, c]) await g.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "P", language: "typescript", source: TS.Int }, game.gameId) });
  await waitFor(async () => { const k = await admin.query(internal.testing.gameCounters, { gameId: game.gameId }); return k?.phase === "running" && k.worldSeconds > 3; }, "running", 120_000, 500);
  let { newCursor: cursor } = await page(0);
  const rows: any[] = [];
  const end = Date.now() + 40_000;
  while (Date.now() < end) { await sleep(1000); const p = await page(cursor); cursor = p.newCursor; for (const e of p.entries) if (e.identifier === "engine/loop.js:commit" || e.identifier === "engine/loop:commit") rows.push(e); }
  await a.c.mutation(api.rooms.endActiveGame, { roomId });
  const med = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const p90 = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length * 0.9)]; };
  const ms = rows.map(r => r.executionTime * 1000), user = rows.map(r => (r.userExecutionTime ?? 0) * 1000);
  const w = rows.map(r => r.usageStats?.databaseWriteDocuments ?? 0), rd = rows.map(r => r.usageStats?.databaseReadDocuments ?? 0);
  console.log(JSON.stringify({ commits: rows.length, medianMs: med(ms), p90Ms: p90(ms), medianUserMs: med(user), medianWrites: med(w), p90Writes: p90(w), maxWrites: Math.max(...w), medianReads: med(rd), keys: Object.keys(rows[0]?.usageStats ?? {}) }));
});
