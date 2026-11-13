/**
 * The replay reducer (src/replay.ts) on hand-built pages of a transparent (ended-game) replay. What would break: a
 * transform that does not replace the object's contribution to every god's total, an agent account that is not
 * settled before an act's charge (or is capped by a battery: there is none), keyframe seeking that disagrees with applying the
 * log from the start, seeking by world time on a log whose world times step back across batches, god energy that
 * keeps running after the end, attribution lost on an act.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameSettings } from "@workspace/game-core";
import { observationSchema } from "../src/protocol.ts";
import { CHANGE_READ_RATIO } from "@workspace/game-core";
import { KEYFRAME_EVERY, REPLAY_VERSION, agentSeries, buildReplay, cursorAtWorld, godEnergyAt, keyMoments, replayEvents, replayMyUtility, replayObservation, replayTrajectories, scoreSeries, stateAt, viewOf, type ReplayBatch, type ReplayEvent, type ReplayPage } from "../src/replay.ts";

const settings = { powerPerSecond: 4, startingEnergy: 100 } as unknown as GameSettings;
const charge = (total: number) => ({ read: total, change: 0, total });
const account = { balance: 0, settledWorldSeconds: 0 };
const summon = (agentId: string, ownerId: string, summonCost = 30, powerShare?: number) => ({
  type: "agent.summoned" as const, agentId, ownerId, worldSeconds: 0, language: "typescript", source: `src of ${agentId}`, summonCost,
  expectedActCost: 4, breakdown: { read: 2, change: 2 }, randomized: false, account, ...(powerShare !== undefined ? { powerShare } : {}),
});
const T0 = 1_000_000;
const page = (batches: ReplayBatch[], extra: Partial<ReplayPage> = {}): ReplayPage => ({
  version: REPLAY_VERSION,
  game: {
    id: "g", shortCode: "G", phase: "ended", startedAt: T0, planningEndsAt: T0, endedAt: T0 + 20_000, endReason: "owner", worldSeconds: 30, endAtWorld: 30,
    settings, setup: null, roster: [{ id: "me", name: "Me", kind: "human" }, { id: "you", name: "You", kind: "human" }], objectInstance: null,
    seasonCommitment: "c", logSchema: 3, currentLogSchema: 3,
  },
  viewer: { godId: "me", index: 0 },
  batches, chat: [], chatCursor: 0, nextCursor: batches.at(-1)?.seq ?? -1, latestCursor: batches.at(-1)?.seq ?? -1, done: true, ...extra,
});

test("every god's totals, every agent with its owner and source, and exact accounts follow the log", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [
      { type: "phase", phase: "planning", worldSeconds: 0 },
      // me: 3 × (2) = 6; you: 2 × (3) = 6.
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [3, 2] },
    ] },
    { seq: 1, at: T0 + 1000, worldFrom: 0, worldTo: 0, events: [summon("a1", "me", 30, 0.25), summon("b1", "you", 50, 0.5)] },
    { seq: 2, at: T0 + 12_000, worldFrom: 0, worldTo: 10, events: [
      { type: "phase", phase: "running", worldSeconds: 0 },
      // 10 s at 1/s from 0 is 10 (no cap); the act costs 5: 5 left. me: −1 × 1; you: 1 × max(0, −1) = 0.
      { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 10, agentId: "a1", ownerId: "me", calls: [], cost: charge(5), net: [-1, 1], seed: "42" },
      // you: 4 × 2 = 8; me: 2 × 4 = 8.
      { type: "object.transformed", objectId: "o1", value: 3, before: 2, version: 2, worldSeconds: 10, agentId: "b1", ownerId: "you", calls: [], cost: charge(1), net: [2, 4] },
      // 1 s later: +1 (4), then −2: 2.
      { type: "agent.failed", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 11, reason: "x", cost: charge(2) },
      { type: "agent.destroyed", agentId: "a1", ownerId: "me", worldSeconds: 11 },
    ] },
  ])]);
  assert.deepEqual(stateAt(replay, 2).totals, [6, 6]);
  assert.deepEqual(stateAt(replay, 6).totals, [-1, 0], "after the first change: exact, at that event");
  const s = stateAt(replay, replay.log.length);
  assert.equal(s.objects.size, 1, "a transform replaces the object, it does not add one");
  assert.deepEqual([s.objects.get("o1")!.value, s.objects.get("o1")!.version, s.objects.get("o1")!.lastOwnerId], [3, 2, "you"]);
  assert.deepEqual(s.totals, [8, 8], "the totals hold only the object's latest net bits");
  assert.deepEqual(viewOf(s.objects.get("o1")!.net, 1), { netBits: 4, peerNetBits: 2, peerCare: 2, payoff: 8 });
  const a1 = s.agents.get("a1")!, b1 = s.agents.get("b1")!;
  assert.deepEqual([a1.ownerId, a1.source, a1.acts, a1.transforms, a1.failures, a1.spent, a1.alive, a1.destroyedAt], ["me", "src of a1", 2, 1, 1, 7, false, 11]);
  assert.deepEqual(stateAt(replay, replay.log.length - 2).agents.get("a1")!.account, { balance: 5, settledWorldSeconds: 10 });
  assert.deepEqual(a1.account, { balance: 4, settledWorldSeconds: 11 });
  assert.deepEqual([b1.ownerId, b1.source, b1.transforms], ["you", "src of b1", 1], "another god's agent in full: its owner and its code");
  assert.equal(s.phase, "running");
  assert.deepEqual(s.spent, [30, 50]);
  // God energy: 100 − the summon price + the unallocated power for 11 world seconds: me 3/s (share 0.25 of 4), you 2/s.
  assert.deepEqual([godEnergyAt(replay, s, 0), godEnergyAt(replay, s, 1)], [100 - 30 + 33, 100 - 50 + 22]);
});

test("a skipped act pays its reads, counts as a skip and not as a failure; energy is not capped", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 20, events: [
    { type: "phase", phase: "running", worldSeconds: 0 }, summon("a1", "me", 30, 0.25),
    { type: "agent.skipped", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 20, cost: { read: 1.5, change: 0, total: 1.5 } },
  ] }])]);
  const a1 = stateAt(replay, replay.log.length).agents.get("a1")!;
  assert.deepEqual([a1.acts, a1.skips, a1.transforms, a1.failures, a1.spent], [1, 1, 0, 0, 1.5]);
  assert.deepEqual(a1.account, { balance: 20 - 1.5, settledWorldSeconds: 20 }, "20 s of income at 1/s, with no battery cap, less the reads");
});

test("god energy runs on world time: all of the power, 4 bits per world second, until the world's end", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0 + 60_000, worldFrom: 0, worldTo: 0, events: [{ type: "phase", phase: "ended", worldSeconds: 30 }] }])]);
  assert.equal(godEnergyAt(replay, stateAt(replay, 1), 0), 100 + 30 * 4, "30 world seconds, not the wall time of the batch");
});

test("a re-allocation settles both accounts and then changes the rates; a destroyed agent's share returns; an old summon has share 0", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 40, events: [
    { type: "phase", phase: "running", worldSeconds: 0 },
    summon("a1", "me", 30, 0.5),               // me: 70 energy, +2/s unallocated; a1 earns 2/s
    { ...summon("old", "me", 10), name: "Painter", description: "paints" },   // an older log: no share at all (0), 10 more bits
    { type: "agent.power", agentId: "a1", ownerId: "me", worldSeconds: 10, share: 0.25 },   // a1 had 20 bits; me: 60 + 20 = 80
    { type: "agent.power", agentId: "old", ownerId: "me", worldSeconds: 20, share: 0.5 },   // me: 80 + 10 × 3 = 110; allocated 0.75
    { type: "agent.destroyed", agentId: "a1", ownerId: "me", worldSeconds: 30 },           // me: 110 + 10 × 1 = 120; allocated 0.5
  ] }])]);
  const upto = (n: number) => stateAt(replay, n);
  // Cursor 3 = phase, a1, old summoned: nothing has accrued yet.
  assert.equal(godEnergyAt(replay, upto(3), 0), 100 - 30 - 10);
  assert.deepEqual(upto(3).agents.get("old")!.share, 0);
  const afterFirst = upto(4);
  assert.deepEqual(afterFirst.agents.get("a1")!.account, { balance: 20, settledWorldSeconds: 10 }, "settled at the old share (2/s) first");
  assert.equal(afterFirst.agents.get("a1")!.share, 0.25);
  assert.equal(godEnergyAt(replay, afterFirst, 0), 60 + 10 * 2, "10 s at the old unallocated half");
  assert.equal(godEnergyAt(replay, upto(5), 0), 80 + 10 * 3, "then 3/s while 0.25 is allocated");
  const end = upto(replay.log.length);
  assert.equal(godEnergyAt(replay, end, 0), 110 + 10 * 1, "then 1/s while 0.75 is allocated");
  assert.equal(end.deities[0].allocated, 0.5, "the destroyed agent's 0.25 came back");
  // The observation at the end: the one live agent earns its 0.5 × 4, and the god's income is the other half.
  const obs = replayObservation(replay, { room: { roomId: "r", roomShortCode: "R" }, cursor: replay.log.length, pov: 0 });
  assert.deepEqual([obs.self.allocated, obs.self.income], [0.5, 2]);
  assert.deepEqual(obs.agents.map(a => [a.id, a.powerShare, a.income]), [["old", 0.5, 2]]);
  assert.deepEqual(obs.agents.map(a => [a.name, a.description]), [["Painter", "paints"]], "the replay keeps the agent's name and description");
  assert.deepEqual([obs.economy!.powerPerSecond, obs.economy!.startingEnergy], [4, 100]);
  // A log from before event-log schema 8 was charged at one energy bit per bit read: κ = 1, whatever the code's κ is now.
  assert.equal(obs.economy!.changeReadRatio, 1);
  const p8 = page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 1, events: [{ type: "phase", phase: "running", worldSeconds: 0 }] }]);
  const priced = buildReplay([{ ...p8, game: { ...p8.game, logSchema: 8 } }]);
  assert.equal(replayObservation(priced, { room: { roomId: "r", roomShortCode: "R" }, cursor: 1, pov: 0 }).economy!.changeReadRatio, CHANGE_READ_RATIO);
  // The cost model the recorded change costs were priced under: the game's settings; a game from before cost models is set-v1.
  assert.equal(obs.economy!.costModel, "set-v1");
  const byDistance = buildReplay([{ ...p8, game: { ...p8.game, logSchema: 10, settings: { ...p8.game.settings, costModel: "distance-v1" } } }]);
  assert.equal(replayObservation(byDistance, { room: { roomId: "r", roomShortCode: "R" }, cursor: 1, pov: 0 }).economy!.costModel, "distance-v1");
  // The event window carries the god's own re-allocations.
  assert.equal(replayEvents(replay, { room: { roomId: "r", roomShortCode: "R" }, cursor: replay.log.length, pov: 0 }).events.filter(e => e.type === "agent.power").length, 2);
  assert.equal(replayEvents(replay, { room: { roomId: "r", roomShortCode: "R" }, cursor: replay.log.length, pov: 1 }).events.filter(e => e.type === "agent.power").length, 0, "another god's are not shown");
});

test("seeking through keyframes equals applying the log from the start; world seeks use the running maximum", () => {
  const events = Array.from({ length: KEYFRAME_EVERY * 3 + 17 }, (_, i) => ({
    type: "object.transformed" as const, objectId: `o${i % 7}`, value: i, before: i - 1, version: i, worldSeconds: i / 10, agentId: "b", ownerId: "you",
    calls: [], cost: charge(0), net: [(i % 5) - 2, i % 3],
  }));
  // A summon committed mid-tick carries a world time past the next batch's first events.
  const batches: ReplayBatch[] = [
    { seq: 0, at: T0, worldFrom: 0, worldTo: 40, events: events.slice(0, 400) },
    { seq: 1, at: T0, worldFrom: 40, worldTo: 40, events: [{ ...summon("z", "you"), worldSeconds: 45 }] },
    { seq: 2, at: T0, worldFrom: 40, worldTo: 80, events: events.slice(400) },
  ];
  const replay = buildReplay([page(batches.slice(0, 2)), page(batches.slice(2))]);
  assert.equal(replay.log.length, events.length + 1, "pages concatenate in cursor order");
  for (const cursor of [0, 1, KEYFRAME_EVERY - 1, KEYFRAME_EVERY, KEYFRAME_EVERY + 1, 401, 402, replay.log.length]) {
    const fromKeyframe = stateAt(replay, cursor);
    const fromStart = stateAt({ ...replay, keyframes: replay.keyframes.slice(0, 1) }, cursor);
    assert.deepEqual(fromKeyframe, fromStart, `cursor ${cursor}`);
  }
  assert.equal(cursorAtWorld(replay, 39.9), 400, "every event up to 39.9 s");
  assert.equal(cursorAtWorld(replay, 44), 400, "the summon at 45 s is not applied at 44 s");
  // Events at 40.0–44.9 s after the summon sit under its 45 s high-water mark: they apply with it at 45 s, as does 45.0 s.
  assert.equal(cursorAtWorld(replay, 45), 401 + 51);
  assert.equal(stateAt(replay, cursorAtWorld(replay, 1e9)).cursor, replay.log.length);
});

test("chat is placed by its world stamp, or by wall time against the batches before stamps existed, once across pages", () => {
  const m = (id: string, timestamp: number, worldSeconds?: number) => ({ id, authorId: "you", authorName: "You", kind: "human" as const, text: id, timestamp, ...(worldSeconds !== undefined ? { worldSeconds } : {}) });
  const batches: ReplayBatch[] = [
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [{ type: "phase", phase: "running", worldSeconds: 0 }] },
    { seq: 1, at: T0 + 5000, worldFrom: 0, worldTo: 5, events: [{ type: "phase", phase: "paused", worldSeconds: 5 }] },
  ];
  const replay = buildReplay([page(batches.slice(0, 1), { chat: [m("stamped", T0 + 1, 2.5)] }), page(batches.slice(1), { chat: [m("stamped", T0 + 1, 2.5), m("legacy", T0 + 6000)] })]);
  assert.deepEqual(replay.chat.map(c => [c.id, c.world]), [["stamped", 2.5], ["legacy", 5]]);
});

test("a log from before summons were recorded still lists every agent, attributed, from its acts", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 1, events: [
    { type: "agent.failed", objectId: "o", agentId: "old", ownerId: "you", worldSeconds: 1, reason: "x", cost: charge(3) },
  ] }])]);
  const agent = stateAt(replay, 1).agents.get("old")!;
  assert.deepEqual([agent.ownerId, agent.acts, agent.spent, agent.source], ["you", 1, 3, undefined]);
});

test("an unattributed transformation changes the object but invents no agent", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 1, events: [
    { type: "object.spawned", objectId: "o", value: 1, version: 0, worldSeconds: 0, net: [1, 1] },
    { type: "object.transformed", objectId: "o", value: 2, before: 1, version: 1, worldSeconds: 1, calls: [], cost: charge(1), net: [2, 1] },
  ] }])]);
  const s = stateAt(replay, 2);
  assert.deepEqual([s.objects.get("o")!.value, s.agents.size], [2, 0]);
});

test("a replay of another API version is refused rather than misread", () => {
  assert.throws(() => buildReplay([{ ...page([]), version: REPLAY_VERSION + 1 }]), /not supported/);
});

test("score series: every god's exact total after every event, downsampled only past maxPoints", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [
      { type: "phase", phase: "running", worldSeconds: 0 },
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [3, 2] },
      { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 2, agentId: "a", ownerId: "you", calls: [], cost: charge(1), net: [-1, 4] },
    ] },
  ])]);
  const s = scoreSeries(replay);
  // A point before any event, then one per event: 0 → (phase) 0 → 6,6 → −4, 0.
  assert.deepEqual(s.cursor, [0, 1, 2, 3]);
  assert.deepEqual(s.world, [0, 0, 0, 2]);
  assert.deepEqual(s.totals, [[0, 0, 6, -4], [0, 0, 6, 0]]);
  const few = scoreSeries(replay, 2);
  assert.equal(few.cursor.length, 2);
  assert.equal(few.cursor.at(-1), 3, "the last point is the end, exactly");
});

test("key moments: phases, each god's first summon and the largest swings, in log order", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [
      { type: "phase", phase: "planning", worldSeconds: 0 },
      summon("a1", "me"),
      { type: "phase", phase: "running", worldSeconds: 0 },
      // me 3 × 2 = 6, you 2 × 3 = 6: both +6.
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [3, 2] },
      // me 1 × 9 = 9, you 9 × 1 = 9: both +3.
      { type: "object.transformed", objectId: "o1", value: 3, before: 1, version: 1, worldSeconds: 3, agentId: "b", ownerId: "you", calls: [], cost: charge(1), net: [1, 9] },
      { type: "phase", phase: "ended", worldSeconds: 5, reason: "owner" },
    ] },
  ])]);
  const moments = keyMoments(replay);
  assert.deepEqual(moments.filter(m => m.kind === "phase").map(m => m.cursor), [1, 3, 6], "planning, running, ended (cursor: events applied)");
  assert.deepEqual(moments.filter(m => m.kind === "summon").map(m => [m.cursor, m.god]), [[2, 0]]);
  assert.deepEqual(moments.filter(m => m.kind === "swing").map(m => [m.cursor, m.god, m.delta]), [[4, 0, 6], [4, 1, 6], [5, 0, 3], [5, 1, 3]]);
  assert.ok(moments.every((m, i) => i === 0 || moments[i - 1].cursor <= m.cursor), "in log order");
});

test("lead changes: a new sole leader is a moment; ties are not", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [
      // me 1 × 2 = 2, you 2 × 1 = 2 (tie).
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [1, 2] },
      // o2: me 3 × 1 = 3, you 1 × 3 = 3 → 5/5 tie.
      { type: "object.spawned", objectId: "o2", value: 2, version: 0, worldSeconds: 1, net: [3, 1] },
      // o1 → [4, 2]: me 4×2 = 8, you 2×4 = 8; totals 11/11 tie. o1 → [5, 1]: me 5, you 5 → 8/8.
      // A third god would break symmetry; with two gods payoffs are symmetric, so leads come from peerCare floors:
      // o2 → [3, -2]: me 3 × max(0, −2) = 0, you −2 × 3 = −6 → me 2 (o1) + 0, you 2 − 6 = −4: me leads.
      { type: "object.transformed", objectId: "o2", value: 3, before: 2, version: 1, worldSeconds: 2, agentId: "a", ownerId: "me", calls: [], cost: charge(1), net: [3, -2] },
    ] },
  ])]);
  const leads = keyMoments(replay).filter(m => m.kind === "lead");
  assert.deepEqual(leads.map(m => [m.cursor, m.god]), [[3, 0]]);
});

test("a leader who is tied and then pulls ahead again has not changed: one lead moment, not two", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 3, events: [
    // me 3 × 1 = 3, you 1 × 3 = 3: tied. o2 [3, −2]: me 3 × 0 = 0, you −2 × 3 = −6 → me 3, you −3: me leads.
    { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [3, 1] },
    { type: "object.spawned", objectId: "o2", value: 2, version: 0, worldSeconds: 1, net: [3, -2] },
    // o2 → [3, 1]: me 3 × 1 = 3, you 1 × 3 = 3 → 6/6: tied.
    { type: "object.transformed", objectId: "o2", value: 3, before: 2, version: 1, worldSeconds: 2, agentId: "a", ownerId: "me", calls: [], cost: charge(1), net: [3, 1] },
    // o2 → [3, −2] again: me leads again.
    { type: "object.transformed", objectId: "o2", value: 4, before: 3, version: 2, worldSeconds: 3, agentId: "a", ownerId: "me", calls: [], cost: charge(1), net: [3, -2] },
  ] }])]);
  assert.deepEqual(keyMoments(replay).filter(m => m.kind === "lead").map(m => [m.cursor, m.god]), [[2, 0]]);
});

test("the SDK's answers at a playhead, for any god: the observation, the event window, trajectories and the utility", () => {
  const full = { ...settings, languages: ["typescript"], objectType: "Int", typeArgs: { min: 0, max: 9 }, priorId: "uniform", penaltyWeight: 0,
    maxAgentsPerGod: 4 } as unknown as GameSettings;
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [
      { type: "phase", phase: "running", worldSeconds: 0 },
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [3, 2] },
      summon("a1", "me"),
    ] },
    { seq: 1, at: T0 + 4000, worldFrom: 0, worldTo: 4, events: [
      { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 4, agentId: "a1", ownerId: "me", calls: [["add", { k: 1 }]], cost: charge(5), net: [-1, 4] },
    ] },
  ], {
    game: { ...page([]).game, settings: full, objectInstance: undefined },
    gods: [{ godId: "me", index: 0, utility: { familyId: "f", params: { a: 1 } }, card: { name: "Mine" }, spent: 30, pauseUsed: false },
      { godId: "you", index: 1, utility: { familyId: "g", params: { b: 2 } }, card: { name: "Yours" }, spent: 0, pauseUsed: true }],
    chat: [{ id: "c1", authorId: "you", authorName: "You", kind: "human", text: "hi", timestamp: T0 + 1, worldSeconds: 1 },
      { id: "c2", authorId: "me", authorName: "Me", kind: "human", text: "later", timestamp: T0 + 9, worldSeconds: 9 }],
  })]);
  const at = (cursor: number, pov: number) => ({ room: { roomId: "r", roomShortCode: "R" }, cursor, pov });
  // As "you" (index 1) after every event: you hold 4 bits on o1, the others (me) −1: their care is 0, your payoff 0.
  const youEnd = replayObservation(replay, at(4, 1));
  assert.deepEqual(youEnd.objects, [{ id: "o1", value: 2, own: { ordinal: 4, rewardBits: 4, netBits: 4 }, peerNetBits: -1, peerCare: 0, payoff: 0,
    mutations: 1, createdAt: 0, lastMutatedAt: 4 }]);
  assert.deepEqual(youEnd.self, { godId: "you", label: "You", isAI: false, energy: 100 + 4 * 4, allocated: 0, income: 4, ready: false, pauseUsed: true, utility: { name: "Yours" } });
  assert.deepEqual(youEnd.agents, [], "the point of view's own agents: you summoned none");
  assert.deepEqual(youEnd.leaderboard.map(r => [r.godId, r.totalPayoff]), [["you", 0], ["me", -4]], "ranked, as live");
  assert.deepEqual(youEnd.chat.map(c => c.text), ["hi"], "chat up to the playhead (world 4)");
  assert.equal(youEnd.economy!.worldSeconds, 4);
  assert.equal(youEnd.phase, "running");
  // What every panel reads: the protocol's own shape (the fixture's card is a stand-in, so it is left out of the parse).
  observationSchema.parse({ ...youEnd, self: { ...youEnd.self, utility: undefined } });
  // As "me" before the transformation: my agent, settled to the playhead (world 0: nothing accrued), no transformations yet.
  const meMid = replayObservation(replay, at(3, 0));
  assert.deepEqual(meMid.agents.map(a => [a.id, a.source, a.energy, a.eligible, a.acts]), [["a1", "src of a1", 0, false, 0]]);
  assert.deepEqual(meMid.transformations, []);
  // The public figures follow the playhead: before the transformation the object has had none, after it one, at world 4.
  assert.deepEqual(replayObservation(replay, at(3, 0)).objects.map(o => [o.mutations, o.createdAt, o.lastMutatedAt]), [[0, 0, null]]);
  assert.deepEqual(replayObservation(replay, at(4, 0)).transformations, [{ id: "1:0", agentId: "a1", before: 1, after: 2, calls: [["add", { k: 1 }]], cost: 5 }]);
  // Events: the window up to the playhead, each with the point of view's bits; calls are shown for everyone (transparent).
  const ev = replayEvents(replay, at(4, 1), 20);
  assert.equal(ev.events.length, 4);
  assert.deepEqual(ev.events.at(-1), { type: "object.transformed", seq: 1, objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 4, agentId: "a1", mine: false,
    calls: [["add", { k: 1 }]], cost: charge(5), own: { netBits: 4 }, peerNetBits: -1, peerCare: 0, payoff: 0 });
  assert.deepEqual([ev.nextCursor, ev.latestCursor], [1, 1]);
  assert.deepEqual(replayEvents(replay, at(2, 1), 20).events.map(e => e.type), ["phase", "object.spawned"]);
  // Trajectories: the object's series for the point of view up to the playhead.
  assert.deepEqual(replayTrajectories(replay, at(4, 0)).objects, [{ objectId: "o1", points: [
    { seq: 0, worldSeconds: 0, value: 1, ownNetBits: 3, peerNetBits: 2, payoff: 6 }, { seq: 1, worldSeconds: 4, value: 2, ownNetBits: -1, peerNetBits: 4, payoff: -4 }] }]);
  const mine = replayMyUtility(replay, 1)!;
  assert.deepEqual([mine.godId, mine.utility, mine.objectType], ["you", { familyId: "g", params: { b: 2 } }, "Int"]);
});

test("the event window is the last `limit` batches up to the playhead (at most 50, as live); trajectories honour afterSeq and name their point of view", () => {
  const spawn = (id: string, w: number) => ({ type: "object.spawned" as const, objectId: id, value: w, version: 0, worldSeconds: w, net: [1, 1] });
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [spawn("a", 0), spawn("b", 0)] },
    { seq: 2, at: T0, worldFrom: 0, worldTo: 1, events: [spawn("c", 1)] },
    { seq: 5, at: T0, worldFrom: 1, worldTo: 2, events: [spawn("d", 2), spawn("e", 2)] },
  ])]);
  const at = (cursor: number) => ({ room: { roomId: "r" }, cursor, pov: 0 });
  assert.deepEqual(replayEvents(replay, at(5), 2).events.map(e => (e as { objectId: string }).objectId), ["c", "d", "e"], "two batches, whatever their seqs");
  assert.deepEqual(replayEvents(replay, at(4), 1).events.map(e => (e as { objectId: string }).objectId), ["d"], "up to the playhead");
  assert.equal(replayEvents(replay, at(5), 500).events.length, 5);
  const t = replayTrajectories(replay, at(5), 2);
  assert.deepEqual(t.objects.map(o => o.objectId), ["d", "e"], "after seq 2");
  assert.equal(t.epoch, "pov:0");
  // A closed window (`upTo`), as live: only its own batches, and it reports its own end, not the playhead's.
  const w = replayTrajectories(replay, at(5), -1, 2);
  assert.deepEqual(w.objects.map(o => o.objectId), ["a", "b", "c"], "seq 0..2");
  assert.deepEqual([w.nextCursor, w.latestCursor], [2, 2]);
  assert.deepEqual(replayTrajectories(replay, at(5), 2, 4).objects, [], "no batch in 3..4");
});

test("My agents at a playhead: the spend split into reading and changing, and how the acts ended, up to the playhead, as live", () => {
  const room = { roomId: "r", roomShortCode: "R" };
  const cost = (read: number, change: number) => ({ read, change, total: read + change });
  const events: ReplayEvent[] = [
    { type: "phase", phase: "running", worldSeconds: 0 }, summon("a1", "me", 30, 0.5),
    { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [1, 0] },
    // Act 1: a transform reading 2 and changing 6. Act 2: a skip reading 1.5. Act 3: a failure reading 0.5 and changing 4.
    { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 5, agentId: "a1", ownerId: "me", calls: [], cost: cost(2, 6), net: [2, 0] },
    { type: "agent.skipped", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 6, cost: cost(1.5, 0) },
    { type: "agent.failed", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 7, reason: "another object already has this value", cost: cost(0.5, 4) },
    { type: "agent.failed", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 8, reason: "TypeError: x is undefined", error: true, cost: cost(1, 0) },
  ];
  const at = (logSchema: number, cursor: number) => {
    // The runtime error's mark exists from event-log schema 9 on.
    const logged = logSchema >= 9 ? events : events.map(e => (e.type === "agent.failed" ? { ...e, error: undefined } : e));
    const p = page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 10, events: logged }]);
    const replay = buildReplay([{ ...p, game: { ...p.game, logSchema } }]);
    const obs = replayObservation(replay, { room, cursor, pov: 0 });
    return obs.agents.find(a => a.id === "a1")!;
  };
  // Before its first act, as live (spentRead is written by the first act): no split, no outcomes yet.
  const before = at(9, 3);
  assert.deepEqual([before.acts, before.spent, before.spentRead, before.diagnosis], [0, 0, undefined, undefined]);
  // After acts 1 and 2: 3.5 read of 9.5 spent.
  const mid = at(9, 5);
  assert.deepEqual([mid.acts, mid.spent, mid.spentRead, mid.skips], [2, 9.5, 3.5, 1]);
  assert.equal(mid.diagnosis, undefined, "no failure yet");
  // At the end: 5 read of 15 spent; one collision and one runtime error of three counted acts (skips are not counted).
  const end = at(9, events.length);
  assert.deepEqual([end.acts, end.spent, end.spentRead], [4, 15, 5]);
  assert.deepEqual(end.outcomes, { transforms: 1, failures: { collision: 1, noChange: 0, commit: 0, invalid: 0, error: 1, unaffordable: 0 }, lastFailures: { error: "TypeError: x is undefined" } });
  assert.match(end.diagnosis!.summary, /^2 of 3 acts failed: another object already has this value ×1, its code raised or ran out of time ×1$/);
  assert.match(end.diagnosis!.hint!, /only one object can hold a value/, "most acts failed: the fix for the first of the tied kinds");
  // A log from before the {read, change, total} cost (schema ≤ 4): the total only, never a made-up split.
  assert.deepEqual([at(4, events.length).spent, at(4, events.length).spentRead], [15, undefined]);
  // A log from before runtime errors were marked (schema ≤ 8): an unmarked reason may be either an invalid call or an
  // error, so the outcomes and diagnosis are left out rather than guessed; a log whose failures are all rule failures keeps them.
  assert.deepEqual([at(8, events.length).outcomes, at(8, events.length).diagnosis], [undefined, undefined]);
  assert.equal(at(8, events.length - 1).diagnosis!.summary, "1 of 2 acts failed: another object already has this value");
});

test("My agents' energy series: each agent's energy at every scoreboard interval of world time, as the tick samples it live", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 30, events: [
    { type: "phase", phase: "running", worldSeconds: 0 },
    summon("a1", "me", 30, 0.25),                     // a1 earns 1/s from 0
    summon("b1", "you", 30, 0.5),                     // b1 earns 2/s
    { type: "agent.skipped", objectId: "o1", agentId: "a1", ownerId: "me", worldSeconds: 15, cost: { read: 4, change: 0, total: 4 } },
    { type: "agent.destroyed", agentId: "a1", ownerId: "me", worldSeconds: 25 },
    { type: "phase", phase: "ended", worldSeconds: 30 },
  ] }], { game: { ...page([]).game, settings: { ...settings, scoreIntervalSeconds: 10 } as unknown as GameSettings } })]);
  const series = agentSeries(replay);
  // Mine: 10 s → 10; 20 s → 20 − 4 = 16; at 30 s a1 is gone, so no row (live writes rows only for a god with agents).
  assert.deepEqual(series[0], [{ world: 10, agents: [{ id: "a1", energy: 10 }] }, { world: 20, agents: [{ id: "a1", energy: 16 }] }]);
  assert.deepEqual(series[1].map(r => [r.world, r.agents[0].energy]), [[10, 20], [20, 40], [30, 60]], "each god's own agents");
});

test("a game with fullChargeSeconds replays its accounts within their capacity; one without it has none", () => {
  // P = 4 bits/s, T = 20 s. Hand-derived: nothing allocated holds 80, half 40, three quarters 60.
  const events: ReplayEvent[] = [
    { type: "phase", phase: "running", worldSeconds: 0 },
    summon("a1", "me", 30, 0.5),               // me: min(100, 80) − 30 = 50, held to 40 (half unallocated); a1 earns 2/s, holds 40
    { type: "agent.power", agentId: "a1", ownerId: "me", worldSeconds: 30, share: 0.25 },   // a1 was full at 20 s: 40, now holds 20
    { type: "agent.destroyed", agentId: "a1", ownerId: "me", worldSeconds: 50 },
  ];
  const capped = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 60, events }])]);
  capped.game.settings = { ...capped.game.settings, fullChargeSeconds: 20 };
  const upto = (n: number) => stateAt(capped, n);
  assert.equal(godEnergyAt(capped, upto(1), 0), 80, "startingEnergy above the capacity is not held");
  assert.equal(godEnergyAt(capped, upto(2), 0), 40, "after the summon: 50 left, but half the power holds 40");
  const lowered = upto(3);
  assert.deepEqual(lowered.agents.get("a1")!.account, { balance: 40, settledWorldSeconds: 30 }, "full after 20 s: 10 s of income were not stored");
  assert.equal(godEnergyAt(capped, lowered, 0), 40, "the god's own store was full too");
  const obs = replayObservation(capped, { room: { roomId: "r", roomShortCode: "R" }, cursor: 3, pov: 0 });
  assert.deepEqual([obs.economy!.fullChargeSeconds, obs.self.capacity, obs.agents[0].capacity, obs.agents[0].energy], [20, 60, 20, 20],
    "the lowered share holds 20: the other 20 are lost at once; the god now holds up to 60");
  assert.equal(godEnergyAt(capped, upto(4), 0), 60, "20 s at 3/s from 40 would be 100: held to 60");
  // The same log without the setting: no capacity anywhere.
  const legacy = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 60, events }])]);
  assert.equal(godEnergyAt(legacy, stateAt(legacy, 4), 0), 100 - 30 + 30 * 2 + 20 * 3);
  const old = replayObservation(legacy, { room: { roomId: "r", roomShortCode: "R" }, cursor: 3, pov: 0 });
  assert.deepEqual([old.economy!.fullChargeSeconds, old.self.capacity, old.agents[0].capacity, old.agents[0].energy], [undefined, undefined, undefined, 60]);
});

test("debt moves with power in a replay: the recorded amount leaves the agent and lands on its god (log schema 13)", () => {
  // P = 4 bits/s, T = 20 s. a1 has half the power (2/s, holds 40) and commits a 50-bit change at 5 s: it owes 40.
  const events: ReplayEvent[] = [
    { type: "phase", phase: "running", worldSeconds: 0 },
    summon("a1", "me", 30, 0.5),               // me: 80 − 30 = 50, held to 40
    { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, net: [1, 1] },
    { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 5, agentId: "a1", ownerId: "me", calls: [], cost: charge(50), net: [1, 1], seed: "1" },
    // At 10 s it has repaid 10 and owes 30; half its power is taken, so 15 of the debt moves to me (I hold 40).
    { type: "agent.power", agentId: "a1", ownerId: "me", worldSeconds: 10, share: 0.25, owed: 15 },
    // At 15 s it has repaid 5 more and owes 10; destroyed: I take the 10.
    { type: "agent.destroyed", agentId: "a1", ownerId: "me", worldSeconds: 15, owed: 10 },
  ];
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 20, events }])]);
  replay.game.settings = { ...replay.game.settings, fullChargeSeconds: 20 };
  const upto = (n: number) => stateAt(replay, n);
  assert.deepEqual(upto(4).agents.get("a1")!.account, { balance: -40, settledWorldSeconds: 5 });
  const lowered = upto(5);
  assert.deepEqual(lowered.agents.get("a1")!.account, { balance: -15, settledWorldSeconds: 10 }, "−40 + 10 s × 2/s = −30, of which 15 moved");
  assert.equal(godEnergyAt(replay, lowered, 0), 40 - 15, "my own energy paid the part that moved");
  const destroyed = upto(6);
  // 5 s at 3/s from 25 is 40, minus the 10 it still owed (−15 + 5 s × 1/s).
  assert.equal(godEnergyAt(replay, destroyed, 0), 40 - 10);
  // Without `owed` (a log from before schema 13) nothing moves: the old behaviour, replayed as it was charged.
  const old = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 20, events: events.map(e => { const { owed: _, ...rest } = e as any; return rest; }) }])]);
  assert.equal(godEnergyAt(old, stateAt(old, 6), 0), 100 - 30 + 10 * 2 + 5 * 3);
});
