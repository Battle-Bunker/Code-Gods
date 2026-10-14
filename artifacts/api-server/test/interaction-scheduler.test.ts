import assert from "node:assert/strict";
import test from "node:test";
import { advanceWorld, completionTarget, InteractionScheduler } from "../src/game/interaction-scheduler.ts";
import type { Game } from "../src/game/types.ts";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(roomIds = ["a"], objectCount = 10, rate = 100) {
  let now = 0, active = true, gameId = "game";
  const runs: { room: string; object: string; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const commits: string[] = [], errors: unknown[] = [];
  const scheduler = new InteractionScheduler(
    () => now, () => active ? roomIds : [],
    (room, available) => {
      const object = Array.from({ length: objectCount }, (_, i) => `${room}-${i}`).find(id => available(gameId, id));
      if (!object) return;
      return {
        roomId: room, gameId, objectId: object, rate,
        execute: () => new Promise((resolve, reject) => runs.push({ room, object, resolve, reject })),
        commit: async (_value, current) => { if (current()) commits.push(object); },
      };
    },
    error => errors.push(error), () => scheduler.pump(),
  );
  return { scheduler, runs, commits, errors, setTime: (value: number) => { now = value; },
    setActive: (value: boolean) => { active = value; }, setGame: (value: string) => { gameId = value; } };
}

test("four deferred runtime jobs overlap, fifth waits, completion refills independently", async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) { h.setTime(i * 10); h.scheduler.pump(); await flush(); }
  assert.equal(h.scheduler.inFlight, 4);
  assert.equal(new Set(h.runs.map(r => r.object)).size, 4);
  h.setTime(1000); h.scheduler.pump();
  assert.equal(h.runs.length, 4);
  h.runs[2].resolve(1); await flush();
  assert.equal(h.runs.length, 5);
  assert.equal(h.scheduler.inFlight, 4);
  assert.equal(h.commits.length, 1);
  const stopping = h.scheduler.stop();
  h.runs.forEach(r => r.resolve(1));
  await stopping;
  assert.equal(h.commits.length, 1);
});

test("cap is deterministic minimum dispatch spacing, not a quota or accumulated debt", async () => {
  const h = harness(["a"], 10, 2);
  h.scheduler.pump(); await flush();
  h.runs[0].resolve(1); await flush();
  for (const time of [1, 100, 499]) { h.setTime(time); h.scheduler.pump(); await flush(); }
  assert.equal(h.runs.length, 1);
  h.setTime(500); h.scheduler.pump(); await flush();
  assert.equal(h.runs.length, 2);
  h.setTime(1e9); h.scheduler.pump(); await flush();
  assert.equal(h.runs.length, 3);
  h.runs[1].resolve(1); h.runs[2].resolve(1); await flush();
  for (let i = 0; i < 100; i++) h.scheduler.pump();
  await flush();
  assert.equal(h.runs.length, 3);
  await h.scheduler.stop();
});

test("round robin admission is fair across rooms under the global four-slot bound", async () => {
  const h = harness(["a", "b", "c", "d", "e", "f"]);
  h.scheduler.pump(); await flush();
  assert.deepEqual(h.runs.map(r => r.room), ["a", "b", "c", "d"]);
  h.setTime(100);
  h.runs[0].resolve(1); await flush();
  h.runs[1].resolve(1); await flush();
  assert.deepEqual(h.runs.slice(4).map(r => r.room), ["e", "f"]);
  assert.equal(h.scheduler.inFlight, 4);
  const stopping = h.scheduler.stop(); h.runs.forEach(r => r.resolve(1)); await stopping;
});

test("same object cannot be dispatched twice; rejected jobs release the reservation and slot", async () => {
  const h = harness(["a"], 1);
  h.scheduler.pump(); await flush();
  h.setTime(10000); h.scheduler.pump(); await flush();
  assert.equal(h.runs.length, 1);
  h.runs[0].reject(new Error("guest failed")); await flush();
  assert.equal(h.errors.length, 1);
  assert.equal(h.runs.length, 2);
  const stopping = h.scheduler.stop(); h.runs[1].resolve(1); await stopping;
});

test("idle invalidation drains old jobs without commits, stop waits for all jobs", async () => {
  const h = harness(["a", "b"]);
  h.scheduler.pump(); await flush();
  h.setActive(false); h.scheduler.invalidate();
  h.runs[0].resolve(1); await flush();
  assert.equal(h.commits.length, 0);
  assert.equal(h.scheduler.inFlight, 1);
  let stopped = false;
  const stopping = h.scheduler.stop().then(() => { stopped = true; });
  await flush(); assert.equal(stopped, false);
  h.runs[1].resolve(1); await stopping;
  assert.equal(h.commits.length, 0);
});

test("new game does not inherit old game's dispatch deadline", async () => {
  const h = harness(["a"], 2, 0.001);
  h.scheduler.pump(); await flush();
  h.setGame("replacement"); h.scheduler.pump(); await flush();
  assert.equal(h.runs.length, 2);
  const stopping = h.scheduler.stop(); h.runs.forEach(r => r.resolve(1)); await stopping;
});

test("capture and commit failures are contained and later jobs still run", async () => {
  let now = 0, captureFails = true, commits = 0;
  const errors: unknown[] = [];
  const scheduler = new InteractionScheduler(() => now, () => ["room"], () => {
    if (captureFails) { captureFails = false; throw new Error("capture failure"); }
    return { roomId: "room", gameId: "game", objectId: "object", rate: 10,
      execute: async () => 1,
      commit: async () => { if (++commits === 1) throw new Error("persistence failure"); },
    };
  }, error => errors.push(error));
  scheduler.pump(); await flush();
  scheduler.pump(); await flush();
  assert.equal(scheduler.inFlight, 0);
  now = 100; scheduler.pump(); await flush();
  assert.equal(commits, 2); assert.equal(errors.length, 2);
  await scheduler.stop();
});

test("cheap game eligibility avoids expensive captures before the dispatch deadline", async () => {
  let gameId = "game", captures = 0;
  const scheduler = new InteractionScheduler(() => 0, () => ["room"], () => {
    captures++;
    return { roomId: "room", gameId, objectId: "object", rate: 1,
      execute: async () => 1, commit: async () => {},
    };
  }, () => {}, () => {}, () => gameId);
  scheduler.pump(); await flush();
  for (let i = 0; i < 100; i++) scheduler.pump();
  assert.equal(captures, 1);
  gameId = "new-game";
  scheduler.pump(); await flush();
  assert.equal(captures, 2);
  await scheduler.stop();
});

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: "game", phase: "running", worldSeconds: 0, lastTick: 0, endAtWorld: 100,
    nextSpawn: Number.MAX_VALUE, nextInteraction: 0, planningEndsAt: 0, pauseEndsAt: 0,
    objects: [{ id: "object", value: 1, version: 0, values: {} }], ...overrides,
  } as Game;
}
const snapshot = { gameId: "game", objectId: "object", version: 0, pauseEndsAt: 0, epoch: 0 };

test("completion guard discards pause/end/recovery, resumed epochs, replacement games and object versions", () => {
  assert.ok(completionTarget(game(), snapshot, 0));
  for (const phase of ["paused", "ended", "recovery", "planning"] as const)
    assert.equal(completionTarget(game({ phase }), snapshot, 0), undefined);
  for (const change of [{ id: "replacement" }, { pauseEndsAt: 1000 }, { executionEpoch: 1 }, { objects: [] }])
    assert.equal(completionTarget(game(change), snapshot, 0), undefined);
  const changed = game(); changed.objects[0].version++;
  assert.equal(completionTarget(changed, snapshot, 0), undefined);
  assert.equal(completionTarget(game(), snapshot, 100000), undefined);
});

test("world advances wall time without agents/completions and ends at sampled exponential lifetime", () => {
  // An exponential half-life sample with U=0.5 is exactly one half-life.
  const halfLife = 30, lifetime = -halfLife * Math.log(0.5) / Math.log(2);
  const g = game({ endAtWorld: lifetime });
  advanceWorld(g, 10000, () => assert.fail("spawn disabled"), () => Infinity);
  assert.equal(g.worldSeconds, 10);
  advanceWorld(g, 1e9, () => assert.fail("spawn disabled"), () => Infinity);
  assert.equal(g.phase, "ended"); assert.equal(g.worldSeconds, 30);
  assert.equal(g.nextInteraction, 0);
});

test("planning and explicit pauses exclude paused time, including ticks after the deadline", () => {
  const g = game({ phase: "planning", planningEndsAt: 10000 });
  advanceWorld(g, 9000, () => {}, () => Infinity);
  assert.equal(g.worldSeconds, 0);
  advanceWorld(g, 11000, () => {}, () => Infinity);
  assert.equal(g.worldSeconds, 1);
  g.phase = "paused"; g.pauseEndsAt = 20000;
  advanceWorld(g, 19000, () => {}, () => Infinity);
  assert.equal(g.worldSeconds, 1);
  advanceWorld(g, 22000, () => {}, () => Infinity);
  assert.equal(g.worldSeconds, 3);
});

test("spawn catchup is bounded by object limit, not fifty missed interaction events", () => {
  const g = game({ nextSpawn: 1, endAtWorld: 10000 });
  const spawn = (g: Game) => { g.objects.push({ id: String(g.objects.length), value: 1, version: 0, values: {} }); };
  advanceWorld(g, 60000, spawn, () => 1);
  assert.equal(g.phase, "running"); assert.equal(g.objects.length, 61); assert.equal(g.worldSeconds, 60);
  advanceWorld(g, 5e6, spawn, () => 1);
  assert.equal(g.phase, "recovery"); assert.equal(g.objects.length, 2000);
  assert.match(g.recoveryReason!, /2,000-object/);
});
