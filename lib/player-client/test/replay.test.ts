/**
 * The replay reducer (src/replay.ts) on hand-built pages of a transparent (ended-game) replay. What would break: a
 * transform that does not replace the object's contribution to every god's total, an agent account that is not
 * settled before an act's charge (or is settled past its battery), keyframe seeking that disagrees with applying the
 * log from the start, seeking by world time on a log whose world times step back across batches, god energy that
 * keeps running after the end, attribution lost on an act.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameSettings } from "@workspace/game-core";
import { observationSchema } from "../src/protocol.ts";
import { KEYFRAME_EVERY, REPLAY_VERSION, buildReplay, cursorAtWorld, godEnergyAt, keyMoments, replayEvents, replayMyUtility, replayObservation, replayTrajectories, scoreSeries, stateAt, viewOf, type ReplayBatch, type ReplayPage } from "../src/replay.ts";

const settings = { agentEnergyPerSecond: 1, agentBatteryActs: 2, startingEnergy: 100, energyPerSecond: 2 } as unknown as GameSettings;
const charge = (total: number) => ({ decision: total, erasure: 0, motion: 0, floor: 0, total, naming: 0 });
const account = { balance: 0, settledWorldSeconds: 0 };
const summon = (agentId: string, ownerId: string, summonCost = 30) => ({
  type: "agent.summoned" as const, agentId, ownerId, worldSeconds: 0, language: "typescript", source: `src of ${agentId}`, summonCost, decisionBits: 4,
  expectedActCost: 4, perActFloorBits: 0, breakdown: { decision: 4, erasure: 0, motion: 0, floor: 0 }, randomized: false, account,
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
    { seq: 1, at: T0 + 1000, worldFrom: 0, worldTo: 0, events: [summon("a1", "me"), summon("b1", "you", 50)] },
    { seq: 2, at: T0 + 12_000, worldFrom: 0, worldTo: 10, events: [
      { type: "phase", phase: "running", worldSeconds: 0 },
      // 10 s at 1/s from 0 is capped by the battery 2 × 4 = 8; the act costs 5: 3 left. me: −1 × 1; you: 1 × max(0, −1) = 0.
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
  assert.deepEqual(stateAt(replay, replay.log.length - 2).agents.get("a1")!.account, { balance: 3, settledWorldSeconds: 10 });
  assert.deepEqual(a1.account, { balance: 2, settledWorldSeconds: 11 });
  assert.deepEqual([b1.ownerId, b1.source, b1.transforms], ["you", "src of b1", 1], "another god's agent in full: its owner and its code");
  assert.equal(s.phase, "running");
  assert.deepEqual(s.spent, [30, 50]);
  // God energy: 100 + 2/s of wall time − spending; at the last batch (12 s in).
  assert.deepEqual([godEnergyAt(replay, s, 0), godEnergyAt(replay, s, 1)], [94, 74]);
});

test("god energy stops at the end of the game", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0 + 60_000, worldFrom: 0, worldTo: 0, events: [{ type: "phase", phase: "ended", worldSeconds: 30 }] }])]);
  assert.equal(godEnergyAt(replay, stateAt(replay, 1), 0), 100 + 20 * 2, "income runs to endedAt (20 s), not to the batch's wall time");
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
    energyPerSecond: 2, agentBatteryActs: 2, maxAgentsPerGod: 4 } as unknown as GameSettings;
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
  assert.deepEqual(youEnd.objects, [{ id: "o1", value: 2, own: { ordinal: 4, rewardBits: 4, netBits: 4 }, peerNetBits: -1, peerCare: 0, payoff: 0 }]);
  assert.deepEqual(youEnd.self, { godId: "you", label: "You", isAI: false, energy: 100 + 4 * 2, ready: false, pauseUsed: true, utility: { name: "Yours" } });
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
});
