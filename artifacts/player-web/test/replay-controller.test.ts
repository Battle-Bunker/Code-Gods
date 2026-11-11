/**
 * The replay controller (src/core/replay/controller.ts), the dock's replay mode's state: what would break is a
 * playhead outside the log, the board animation missing an object a step changed (or its value before), panels
 * re-rendering on every read because an answer is rebuilt each time (or stale after a move), the point of view not
 * switching every panel's answers, key-moment jumps that skip or stall, and a speed the transport does not offer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { REPLAY_VERSION, buildReplay, type ReplayPage } from "@workspace/player-client/replay";
import { ReplayController } from "../src/core/replay/controller.ts";

const charge = (total: number) => ({ read: total, change: 0, total });
const settings = { languages: ["python"], powerPerSecond: 2, startingEnergy: 100, maxAgentsPerGod: 4,
  penaltyWeight: 0, objectType: "Int", typeArgs: {}, priorId: "uniform" };
const page: ReplayPage = {
  version: REPLAY_VERSION,
  game: { id: "g", shortCode: "G", phase: "ended", startedAt: 0, planningEndsAt: 0, endedAt: 10_000, endReason: "owner", worldSeconds: 5, endAtWorld: 5,
    settings: settings as never, setup: null, roster: [{ id: "a", name: "Ada", kind: "human" }, { id: "b", name: "Bo", kind: "ai" }], objectInstance: undefined, seasonCommitment: "c" },
  viewer: { godId: "a", index: 0 },
  gods: [{ godId: "a", index: 0, utility: { familyId: "f", params: {} }, card: null, spent: 0, pauseUsed: false },
    { godId: "b", index: 1, utility: { familyId: "g", params: {} }, card: null, spent: 0, pauseUsed: false }],
  batches: [{ seq: 0, at: 0, worldFrom: 0, worldTo: 5, events: [
    { type: "phase", phase: "running", worldSeconds: 0 },
    { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [2, 1] },
    { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 2, agentId: "x", ownerId: "b", calls: [], cost: charge(1), net: [1, 3] },
    { type: "object.transformed", objectId: "o1", value: 3, before: 2, version: 2, worldSeconds: 3, agentId: "x", ownerId: "b", calls: [], cost: charge(1), net: [4, 1] },
    { type: "phase", phase: "ended", worldSeconds: 5 },
  ] }],
  chat: [], nextCursor: 0, chatCursor: 0, latestCursor: 0, done: true,
};
const controller = (cursor = 0) => new ReplayController(buildReplay([page]), { roomId: "r" }, { cursor });

test("the playhead stays in the log; a forward move records what it changed and the value before, for the board animation", () => {
  const c = controller(99);
  assert.equal(c.get().cursor, 5, "clamped to the end");
  c.seek(-3);
  assert.equal(c.get().cursor, 0);
  c.seek(4);
  assert.deepEqual([...c.changed].map(([id, ch]) => [id, ch.version, ch.after, ch.before]), [["o1", 2, 3, 2]], "an object changed twice: the last change (version, value, value before)");
  c.step(-1);
  assert.equal(c.changed.size, 0, "moving back animates nothing");
});

test("answers are the same object until the playhead or the point of view moves, then fresh", () => {
  const c = controller(3);
  const first = c.answer("player.observation", { roomId: "r" }) as { objects: { own: { netBits: number }; payoff: number }[]; self: { godId: string } };
  assert.equal(c.answer("player.observation", { roomId: "r" }), first, "memoized: panels do not re-render on every read");
  assert.deepEqual([first.self.godId, first.objects[0].own.netBits, first.objects[0].payoff], ["a", 1, 3]);
  c.setPov(1);
  const bo = c.answer("player.observation", { roomId: "r" }) as typeof first;
  assert.deepEqual([bo.self.godId, bo.objects[0].own.netBits, bo.objects[0].payoff], ["b", 3, 3], "Bo's view of the same moment");
  c.step(1);
  const later = c.answer("player.observation", { roomId: "r" }) as typeof first;
  assert.notEqual(later, bo);
  assert.equal(later.objects[0].own.netBits, 1, "Bo's bits after the next change");
  assert.equal(c.serves("rooms.get"), false, "the room itself is still the engine's");
  assert.match(c.refusal, /replay/);
});

test("key-moment jumps land on moments and stop at the ends; only offered speeds are taken", () => {
  const c = controller(0);
  c.jump(1);
  assert.equal(c.get().cursor, c.moments.find(m => m.cursor > 0)!.cursor);
  c.seek(5);
  c.jump(1);
  assert.equal(c.get().cursor, 5, "past the last moment: the end");
  c.jump(-1);
  assert.ok(c.get().cursor < 5);
  c.setSpeed(3);
  assert.equal(c.get().speed, 2, "3× is not offered");
  c.setSpeed(16);
  assert.equal(c.get().speed, 16);
});

test("player.objectsPage is answered from the replay at the playhead, exactly, in each sort, and follows the point of view", () => {
  const c = controller(5);
  const page = (args: Record<string, unknown> = {}) => c.answer("player.objectsPage", { roomId: "r", ...args }) as
    { rows: { id: string; own: { netBits: number }; peerNetBits: number; rank: number }[]; total: number; matching: number; next: unknown; sumOwnNetBits: number; sumPeerNetBits: number };
  // After the last transform o1 is net [4, 1]: Ada sees own 4 and the others' 1 (exact: the replay is of an ended game).
  const ada = page({ sort: "mine", limit: 5 });
  assert.deepEqual([ada.rows[0].id, ada.rows[0].own.netBits, ada.rows[0].peerNetBits, ada.rows[0].rank, ada.total, ada.next], ["o1", 4, 1, 1, 1, null]);
  assert.equal(page({ sort: "mine", limit: 5 }), ada, "memoized like the other answers");
  c.setPov(1);
  assert.deepEqual([page({ sort: "othersCare" }).rows[0].own.netBits, page({ sort: "othersCare" }).sumPeerNetBits], [1, 4], "Bo sees his own bits and Ada's as the others'");
  c.seek(0);
  assert.equal(page().total, 0, "before the first spawn there is nothing to scroll");
});

// What would break: a panel reading the per-god read model in a replay getting nothing (the engine is not asked in
// replay mode), another god's numbers, or a skeleton cursor that repeats or skips an object.
test("the read model's queries are answered from the replay at the playhead, exactly, and follow the point of view", () => {
  const c = controller(5);
  // At the end o1 is net [4, 1] (exact): Ada own 4, others 1, payoff 4; Bo own 1, others 4, payoff 4.
  const row = c.answer("player.object", { objectId: "o1" }) as { own: { netBits: number }; peerNetBits: number; payoff: number; mutations: number };
  assert.deepEqual([row.own.netBits, row.peerNetBits, row.payoff, row.mutations], [4, 1, 4, 2]);
  assert.equal(c.answer("player.object", { objectId: "nope" }), null);
  assert.deepEqual(c.answer("player.objectIds", { gameId: "g", sort: "mine", limit: 5 }), { rows: [{ id: "o1", key: 4 }], next: null });
  assert.deepEqual(c.answer("player.objectIds", { gameId: "g", filter: "chips" }), { rows: [], next: null }, "o1 is contested, not a chip");
  assert.deepEqual(c.answer("player.objectRank", { objectId: "o1" }), { rank: 1 });
  assert.deepEqual((c.answer("player.objectsTop", { gameId: "g", n: 3 }) as { id: string; rank: number }[]).map(o => [o.id, o.rank]), [["o1", 1]]);
  const totals = c.answer("player.totals", { gameId: "g" }) as { objectCount: number; score: number; contested: number; chips: number; maxOwn: number };
  assert.deepEqual([totals.objectCount, totals.score, totals.contested, totals.chips, totals.maxOwn], [1, 4, 1, 0, 4]);
  c.setPov(1);
  assert.equal((c.answer("player.object", { objectId: "o1" }) as { own: { netBits: number } }).own.netBits, 1, "Bo's own bits");
  c.seek(0);
  assert.deepEqual(c.answer("player.objectIds", { gameId: "g" }), { rows: [], next: null }, "nothing before the first spawn");
});

// What would break: a dock hook in a replay getting nothing (the engine is not asked in replay mode), or the race's
// series running past the playhead.
test("the dock's queries are answered from the replay at the playhead", () => {
  const c = controller(5);
  const state = c.answer("dock.state", { roomId: "r" }) as { phase: string; roster: string[]; objects?: unknown };
  assert.deepEqual([state.phase, state.roster, "objects" in state], ["ended", ["a", "b"], false]);
  assert.ok(Array.isArray(c.answer("dock.agents", { roomId: "r" })));
  const standings = c.answer("games.standings", { gameId: "g" }) as { rows: { deityId: string; rank: number }[] };
  assert.deepEqual(standings.rows.map(r => r.rank), [1, 2]);
  const all = (c.answer("games.standingsHistory", { gameId: "g" }) as { rows: { world: number }[] }).rows;
  c.seek(2);
  const early = (c.answer("games.standingsHistory", { gameId: "g" }) as { rows: { world: number }[] }).rows;
  assert.ok(early.length < all.length, "the series stops at the playhead");
  assert.deepEqual((c.answer("rooms.chat", { roomId: "r", paginationOpts: { numItems: 50, cursor: null } }) as { page: unknown[] }).page, []);
});

// ----- the clock: a continuous playhead in world time (events at world 0, 0, 2, 3 and 5) -----
// No browser frames here: play() asks for one if it can, and advance(ms) moves the clock as a frame would.
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {};
const applied = (t: number) => [0, 0, 2, 3, 5].filter(w => w <= t).length;

test("the clock: at world time t the playhead has applied exactly the events at or before t, at any speed", () => {
  for (const speed of [0.5, 1, 4]) {
    const c = controller(0);
    c.setSpeed(speed);
    c.play();
    let t = 0;
    for (const ms of [250, 400, 900, 1300, 700, 2000]) {
      c.advance(ms);
      t = Math.min(5, t + ms / 1000 * speed);
      assert.ok(Math.abs(c.get().world - t) < 1e-9, `speed ${speed}: the playhead moves speed × real time (${c.get().world} vs ${t})`);
      assert.equal(c.get().cursor, applied(t), `speed ${speed} at ${t}: exactly the events at or before it`);
    }
  }
});

test("the clock: quiet stretches pass in scaled real time (no skipping); playback stops at the game's end", () => {
  const c = controller(0);
  c.setSpeed(1);
  c.play();
  c.advance(2500);
  assert.equal(c.get().world, 2.5, "no jump over the quiet stretch from 3 to 5");
  assert.equal(c.get().cursor, 3);
  c.advance(10_000);
  assert.deepEqual([c.get().world, c.get().cursor, c.get().playing], [5, 5, false], "stops at the end");
});

test("the clock: pause holds the time, resume continues from it, seeking lands between events, stepping lands on them", () => {
  const c = controller(0);
  c.setSpeed(1);
  c.play();
  c.advance(1500);
  c.stop();
  c.advance(5000);
  assert.deepEqual([c.get().world, c.get().cursor], [1.5, 2], "paused: time stands still");
  c.play();
  c.advance(1000);
  assert.deepEqual([c.get().world, c.get().cursor], [2.5, 3], "resumed from where it paused");
  c.seekWorld(2.9);
  assert.deepEqual([c.get().world, c.get().cursor, c.get().playing], [2.9, 3, false], "a seek stops playback, between events");
  c.seekWorld(1);
  assert.equal(c.get().cursor, applied(1), "backwards too");
  c.step(1);
  assert.deepEqual([c.get().cursor, c.get().world], [3, 2], "a step lands on the next event's time");
  c.step(-1);
  assert.deepEqual([c.get().cursor, c.get().world], [2, 0]);
  c.seekWorld(99);
  assert.deepEqual([c.get().world, c.get().cursor], [5, 5], "clamped to the game's end");
  const opened = new ReplayController(buildReplay([page]), { roomId: "r" }, { cursor: 0, world: Infinity });
  assert.deepEqual([opened.get().world, opened.get().cursor], [5, 5], "a page opened at the end (world: Infinity) is at the end");
  assert.deepEqual([new ReplayController(buildReplay([page]), { roomId: "r" }, { cursor: 0, world: 2.5 }).get().cursor], [3], "?t= opens between events");
  c.play();
  assert.deepEqual([c.get().world, c.get().cursor], [0, applied(0)], "play at the end starts over (the events at time 0 included)");
});

test("scrubbing: the board's answers move at most every 125 ms while dragging, and land exactly on release", () => {
  const c = controller(0);
  const at = () => (c.answer("player.observation", { roomId: "r" }) as { economy: { worldSeconds: number } }).economy.worldSeconds;
  c.beginScrub();
  c.seekWorld(2);
  const first = at();
  c.seekWorld(3);
  c.seekWorld(4);
  assert.ok(c.get().scrubbing && c.get().world === 4, "the thumb and the clock follow every move");
  assert.equal(at(), first, "the panels are not re-rendered on every drag frame");
  c.endScrub();
  assert.equal(c.get().scrubbing, false);
  assert.equal(at(), 3, "on release the answers are exactly at the playhead (its last event's time)");
});

test("at the end of a game with a quiet tail, forward moves never take the playhead back in time", () => {
  const tail = buildReplay([{ ...page, game: { ...page.game, worldSeconds: 8, endAtWorld: 8 } }]);
  const c = new ReplayController(tail, { roomId: "r" }, { cursor: 0, world: Infinity });
  assert.deepEqual([c.get().world, c.get().cursor], [8, 5], "opens at the game's end, past its last event");
  c.step(1);
  c.jump(1);
  assert.deepEqual([c.get().world, c.get().cursor], [8, 5], "stepping or jumping forward at the end stays at the end");
  const coarse = c.getCoarse();
  c.play();
  c.seekWorld(1);
  c.play();
  c.advance(100);
  assert.notEqual(c.getCoarse(), coarse, "a change of the events or of playing reaches the coarse view");
  const between = c.getCoarse();
  c.advance(100);
  assert.equal(c.getCoarse(), between, "the clock's per-frame time alone does not");
});

test("dock.agentSeries: the point of view's agents' energy at each scoreboard interval up to the playhead, paged by world", () => {
  const summon = { type: "agent.summoned" as const, agentId: "m", ownerId: "a", worldSeconds: 0, language: "python", source: "s", summonCost: 0, expectedActCost: 1,
    breakdown: { read: 1, change: 0 }, randomized: false, account: { balance: 0, settledWorldSeconds: 0 }, powerShare: 0.5 };
  const withAgent: ReplayPage = { ...page, game: { ...page.game, worldSeconds: 30, endAtWorld: 30, settings: { ...settings, scoreIntervalSeconds: 10 } as never },
    batches: [{ seq: 0, at: 0, worldFrom: 0, worldTo: 30, events: [{ type: "phase", phase: "running", worldSeconds: 0 }, summon,
      { type: "agent.skipped", objectId: "o1", agentId: "m", ownerId: "a", worldSeconds: 25, cost: { read: 0, change: 0, total: 0 } }, { type: "phase", phase: "ended", worldSeconds: 30 }] }] };
  const c = new ReplayController(buildReplay([withAgent]), { roomId: "r" }, { cursor: 0, world: 25 });
  // Ada's agent earns 0.5 × 2 = 1 bit per world second: 10 and 20 by the playhead at 25 s, not 30.
  assert.deepEqual(c.answer("dock.agentSeries", { gameId: "g" }), { rows: [{ world: 10, agents: [{ id: "m", energy: 10 }] }, { world: 20, agents: [{ id: "m", energy: 20 }] }], more: false });
  assert.deepEqual(c.answer("dock.agentSeries", { gameId: "g", after: 10 }), { rows: [{ world: 20, agents: [{ id: "m", energy: 20 }] }], more: false });
  c.setPov(1);
  assert.deepEqual(c.answer("dock.agentSeries", { gameId: "g" }), { rows: [], more: false }, "Bo has no agents");
});
