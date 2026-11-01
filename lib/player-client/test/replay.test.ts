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
import { KEYFRAME_EVERY, REPLAY_VERSION, buildReplay, cursorAtWorld, godEnergyAt, stateAt, viewOf, type ReplayBatch, type ReplayPage } from "../src/replay.ts";

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

test("a replay of another API version is refused rather than misread", () => {
  assert.throws(() => buildReplay([{ ...page([]), version: REPLAY_VERSION + 1 }]), /not supported/);
});
