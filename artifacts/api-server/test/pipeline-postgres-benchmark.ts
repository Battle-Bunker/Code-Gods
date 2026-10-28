import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createRuntime } from "@workspace/game-runtime";
import { defaultSettingsFor, type GameSettings } from "@workspace/game-core";
// @ts-expect-error injected isolated schema profiler
import { pool, stats } from "@workspace/db";
import { actSettings, createRuntimeAdapter, createUtilitiesAdapter, registerAdapters } from "../src/game/adapters";
import { createRoom, mutate, mutateInteraction, resolveRoom, closeStore, initializeStore, rehydrateInteractions } from "../src/game/store";
import { startGame, startTicker } from "../src/game/engine";
import { recordHumanActivity } from "../src/game/activity";
import type { Actor } from "../src/game/types";

const runtime = createRuntime({ language: "typescript", workers: 4, queueLimit: 32 });
const base = createRuntimeAdapter({ typescript: runtime });
const utilities = createUtilitiesAdapter();
const ADD = "function agent(x) { return [add(1)]; }";
/** Always eligible, so the benchmark measures the pipeline rather than agent income. */
const richAgent = (ownerId: string, world: number) => ({ id: randomUUID(), ownerId, source: ADD, createdAt: Date.now(), summonCost: 0,
  expectedActCost: 1, account: { balance: 1e6, settledWorldSeconds: world }, acts: 0, spent: 0 });
const host: Actor = { id: randomUUID(), name: "Isolated benchmark", kind: "human", scope: "browser" };
let stop: (() => Promise<void>) | undefined;
try {
  const settings: GameSettings = { ...defaultSettingsFor("Int", "typescript"), agentEnergyPerSecond: 1000, agentBatteryActs: 1000 };
  // Warm four workers before the measured interval.
  for (let round = 0; round < 10; round++)
    await Promise.all(Array.from({ length: 4 }, () => runtime.act(ADD, 1, actSettings({ ...settings, interactionComputeMs: 50 }))));
  // Only startup warmup uses 50ms; every measured game below retains the default 5ms.
  const room = await createRoom(host);
  registerAdapters({ runtime: base, utilities });
  await mutate(room.id, async draft => {
    draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
    draft.settings = { ...settings, startingObjectCount: 10, spawnRateHz: 0 };
    await startGame(draft, host);
  });
  const objectId = resolveRoom(room.id).game!.objects[0].id;
  await mutateInteraction(room.id, objectId, draft => {
    const g = draft.game!, object = g.objects[0];
    object.version++;
    g.events.push({ id: randomUUID(), gameId: g.id, type: "object.transformed", timestamp: Date.now(),
      before: object.value, object: { ...object }, agentId: "benchmark", ownerId: host.id });
    return true;
  });
  const flushDeadline = performance.now() + 2000;
  while (!(await pool.query("SELECT count(*)::int AS count FROM cg_interaction_batches WHERE room_id=$1", [room.id])).rows[0].count) {
    assert.ok(performance.now() < flushDeadline, "durable append should complete within two seconds");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const checkpoint = (await pool.query("SELECT state FROM cg_rooms WHERE id=$1", [room.id])).rows[0].state;
  const batches = (await pool.query("SELECT room_id,game_id,end_seq,events FROM cg_interaction_batches WHERE room_id=$1 ORDER BY end_seq", [room.id])).rows;
  assert.equal(checkpoint.game.objects[0].version, 0);
  assert.equal(rehydrateInteractions(checkpoint, batches).game!.objects[0].version, 1);
  await initializeStore();
  assert.equal(resolveRoom(room.id).game!.phase, "recovery");
  assert.equal(resolveRoom(room.id).game!.objects[0].version, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM cg_interaction_batches WHERE room_id=$1", [room.id])).rows[0].count, 0);
  await mutate(room.id, async draft => { draft.game!.phase = "ended"; });
  console.log("PostgreSQL crash-replay/recovery checkpoint/atomic log compaction verified");
  for (const mode of ["wasm", "synthetic"] as const) {
    for (const count of [10, 100, 2000]) {
      let runtimeMs = 0, executions = 0, runtimeRejections = 0, scoringMs = 0;
      registerAdapters({
        runtime: { ...base, async act(source, value, settings) {
          const started = performance.now();
          try {
            // Benchmark-only rate bypass; compute budget and instantiation remain unchanged.
            return mode === "synthetic" ? { calls: '[["add",{"k":1}]]' } : await base.act(source, value, { ...settings, interactionRateHz: 1000 });
          } catch (error) { runtimeRejections++; throw error; }
          finally { runtimeMs += performance.now() - started; executions++; }
        } },
        utilities: { ...utilities, score(s, descriptor, value) {
          const started = performance.now();
          try { return utilities.score(s, descriptor, value); }
          finally { scoringMs += performance.now() - started; }
        } },
      });
      await mutate(room.id, async draft => {
        draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
        draft.settings = { ...settings, startingObjectCount: count, spawnRateHz: 0 };
        await startGame(draft, host);
        const g = draft.game!;
        g.phase = "running"; g.lastTick = Date.now(); g.endAtWorld = 3600;
        g.settings.interactionRateHz = 4000; // infrastructure headroom, not production configuration
        g.agents.push(richAgent(host.id, g.worldSeconds));
      });
      await recordHumanActivity();
      runtimeMs = 0; scoringMs = 0;
      stats.breakdown = {};
      const beforeQueries = stats.queries, beforeQueryMs = stats.queryMs;
      const started = performance.now(), utilization = performance.eventLoopUtilization();
      stop = startTicker();
      await new Promise(resolve => setTimeout(resolve, 1500));
      const activeWindowMs = performance.now() - started;
      await stop(); stop = undefined;
      await mutate(room.id, async draft => { draft.game!.phase = "ended"; });
      const elapsedMs = performance.now() - started;
      const sqlQueries = stats.queries - beforeQueries, sqlMs = stats.queryMs - beforeQueryMs;
      const sqlBreakdown = structuredClone(stats.breakdown);
      const saved = (await pool.query("SELECT state FROM cg_rooms WHERE id=$1", [room.id])).rows[0].state;
      const transformations = saved.game.objects.reduce((sum: number, object: any) => sum + object.version, 0);
      assert.equal(transformations, resolveRoom(room.id).game!.objects.reduce((sum, object) => sum + object.version, 0));
      console.log(JSON.stringify({ backend: "isolated PostgreSQL schema", mode, objects: count, transformations,
        perSecond: transformations * 1000 / elapsedMs, elapsedMs, drainAndCheckpointMs: elapsedMs - activeWindowMs,
        executions, runtimeRejections, uncommittedExecutions: executions - transformations - runtimeRejections,
        runtimeMeanMs: runtimeMs / executions, scoringMs, sqlQueries, sqlMs, sqlBreakdown,
        eventLoopUtilization: performance.eventLoopUtilization(utilization).utilization }));
    }
  }
} finally {
  try { await stop?.(); await closeStore(); }
  finally { runtime.close(); await pool.end(); }
}
