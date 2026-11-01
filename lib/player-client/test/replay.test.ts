/**
 * The replay reducer (src/replay.ts) on hand-built pages. What would break: a transform that does not replace the
 * object's contribution to the score sums, an agent account that is not settled before an act's charge (or is
 * settled past its battery), keyframe seeking that disagrees with applying the log from the start, seeking by world
 * time on a log whose world times step back across batches, god energy that keeps running after the end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameSettings } from "@workspace/game-core";
import { KEYFRAME_EVERY, REPLAY_VERSION, buildReplay, cursorAtWorld, godEnergyAt, stateAt, type ReplayBatch, type ReplayPage } from "../src/replay.ts";

const settings = { agentEnergyPerSecond: 1, agentBatteryActs: 2, startingEnergy: 100, energyPerSecond: 2 } as unknown as GameSettings;
const charge = (total: number) => ({ decision: total, erasure: 0, motion: 0, floor: 0, total, naming: 0 });
const T0 = 1_000_000;
const page = (batches: ReplayBatch[], extra: Partial<ReplayPage> = {}): ReplayPage => ({
  version: REPLAY_VERSION,
  game: {
    id: "g", shortCode: "G", phase: "ended", startedAt: T0, planningEndsAt: T0, endedAt: T0 + 20_000, endReason: "owner", worldSeconds: 30,
    settings, setup: null, roster: [{ id: "me", name: "Me", kind: "human" }, { id: "you", name: "You", kind: "human" }], objectInstance: null,
    seasonCommitment: "c", logSchema: 2, currentLogSchema: 2,
  },
  self: { godId: "me", index: 0, utility: null },
  batches, chat: [], chatCursor: 0, nextCursor: batches.at(-1)?.seq ?? -1, latestCursor: batches.at(-1)?.seq ?? -1, done: true, ...extra,
});

test("objects, own agents and score sums follow the log; an act's charge lands on the account settled to the act's world time", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, totals: [6, 0], events: [
      { type: "phase", phase: "planning", worldSeconds: 0 },
      { type: "object.spawned", objectId: "o1", value: 1, version: 0, worldSeconds: 0, own: { netBits: 3 }, peerNetBits: 2, peerCare: 2, payoff: 6 },
    ] },
    { seq: 1, at: T0 + 1000, worldFrom: 0, worldTo: 0, events: [
      { type: "agent.summoned", agentId: "a1", mine: true, worldSeconds: 0, language: "typescript", source: "src", summonCost: 30, expectedActCost: 4, decisionBits: 4, account: { balance: 0, settledWorldSeconds: 0 } },
      { type: "agent.summoned", agentId: "b1", mine: false, worldSeconds: 0 },
    ] },
    { seq: 2, at: T0 + 12_000, worldFrom: 0, worldTo: 10, totals: [-1, 4], events: [
      { type: "phase", phase: "running", worldSeconds: 0 },
      // 10 s at 1/s from 0 is capped by the battery 2 × 4 = 8; the act costs 5: 3 left.
      { type: "object.transformed", objectId: "o1", value: 2, before: 1, version: 1, worldSeconds: 10, agentId: "a1", mine: true, cost: charge(5), own: { netBits: -1 }, peerNetBits: 1, peerCare: 1, payoff: -1 },
      { type: "object.transformed", objectId: "o1", value: 3, before: 2, version: 2, worldSeconds: 10, agentId: "b1", mine: false, own: { netBits: -1 }, peerNetBits: 1, peerCare: 1, payoff: -1 },
      // 1 s later: +1 (4), then −2: 2.
      { type: "agent.failed", objectId: "o1", agentId: "a1", worldSeconds: 11, reason: "x", cost: charge(2) },
      { type: "agent.destroyed", agentId: "a1", mine: true, worldSeconds: 11 },
    ] },
  ])]);
  const after = (n: number) => stateAt(replay, n);
  assert.deepEqual([after(2).score, after(2).ownNetBits, after(2).peerNetBits, after(2).totals], [6, 3, 2, [6, 0]]);
  const s = after(replay.log.length);
  assert.equal(s.objects.size, 1, "a transform replaces the object, it does not add one");
  assert.deepEqual([s.objects.get("o1")!.value, s.objects.get("o1")!.version], [3, 2]);
  assert.deepEqual([s.score, s.ownNetBits, s.peerNetBits, s.totals], [-1, -1, 1, [-1, 4]], "the sums hold only the object's latest score");
  const mine = s.agents.get("a1")!;
  assert.deepEqual([mine.acts, mine.transforms, mine.failures, mine.spent, mine.alive, mine.destroyedAt], [2, 1, 1, 7, false, 11]);
  assert.deepEqual(after(replay.log.length - 2).agents.get("a1")!.account, { balance: 3, settledWorldSeconds: 10 });
  assert.deepEqual(mine.account, { balance: 2, settledWorldSeconds: 11 });
  const theirs = s.agents.get("b1")!;
  assert.deepEqual([theirs.mine, theirs.source, theirs.transforms], [false, undefined, 1], "another god's agent: that it acted, never its source");
  assert.equal(s.phase, "running");
  assert.equal(s.spent, 30);
  // God energy: 100 + 2/s of wall time − 30; at the last batch (12 s in) 100 + 24 − 30.
  assert.equal(godEnergyAt(replay, s), 94);
});

test("god energy stops at the end of the game", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0 + 60_000, worldFrom: 0, worldTo: 0, events: [{ type: "phase", phase: "ended", worldSeconds: 30 }] }])]);
  assert.equal(godEnergyAt(replay, stateAt(replay, 1)), 100 + 20 * 2, "income runs to endedAt (20 s), not to the batch's wall time");
});

test("seeking through keyframes equals applying the log from the start; world seeks use the running maximum", () => {
  const events = Array.from({ length: KEYFRAME_EVERY * 3 + 17 }, (_, i) => ({
    type: "object.transformed" as const, objectId: `o${i % 7}`, value: i, before: i - 1, version: i, worldSeconds: i / 10, agentId: "b", mine: false,
    own: { netBits: (i % 5) - 2 }, peerNetBits: i % 3, peerCare: i % 3, payoff: ((i % 5) - 2) * (i % 3),
  }));
  // A summon committed mid-tick carries a world time past the next batch's first events.
  const batches: ReplayBatch[] = [
    { seq: 0, at: T0, worldFrom: 0, worldTo: 40, events: events.slice(0, 400) },
    { seq: 1, at: T0, worldFrom: 40, worldTo: 40, events: [{ type: "agent.summoned", agentId: "z", mine: false, worldSeconds: 45 }] },
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

test("chat is placed by its world stamp, or by wall time against the batches before stamps existed", () => {
  const replay = buildReplay([page([
    { seq: 0, at: T0, worldFrom: 0, worldTo: 0, events: [{ type: "phase", phase: "running", worldSeconds: 0 }] },
    { seq: 1, at: T0 + 5000, worldFrom: 0, worldTo: 5, events: [{ type: "phase", phase: "paused", worldSeconds: 5 }] },
  ], { chat: [
    { id: "c1", authorId: "you", authorName: "You", kind: "human", text: "stamped", timestamp: T0 + 1, worldSeconds: 2.5 },
    { id: "c2", authorId: "you", authorName: "You", kind: "human", text: "legacy", timestamp: T0 + 6000 },
  ] })]);
  assert.deepEqual(replay.chat.map(m => m.world), [2.5, 5]);
});

test("a log from before summons were recorded still lists the caller's own agents", () => {
  const replay = buildReplay([page([{ seq: 0, at: T0, worldFrom: 0, worldTo: 1, events: [
    { type: "agent.failed", objectId: "o", agentId: "old", worldSeconds: 1, reason: "x", cost: charge(3) },
  ] }])]);
  const agent = stateAt(replay, 1).agents.get("old")!;
  assert.deepEqual([agent.mine, agent.acts, agent.spent, agent.source], [true, 1, 3, undefined]);
});

test("chat merges across pages without repeats", () => {
  const m = (id: string) => ({ id, authorId: "you", authorName: "You", kind: "human" as const, text: id, timestamp: T0, worldSeconds: 1 });
  const replay = buildReplay([page([], { chat: [m("a")] }), page([], { chat: [m("a"), m("b")] })]);
  assert.deepEqual(replay.chat.map(c => c.id), ["a", "b"]);
});

test("a replay of another API version is refused rather than misread", () => {
  assert.throws(() => buildReplay([{ ...page([]), version: REPLAY_VERSION + 1 }]), /not supported/);
});
