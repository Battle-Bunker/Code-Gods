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

const charge = (total: number) => ({ decision: total, erasure: 0, motion: 0, floor: 0, total, naming: 0 });
const settings = { languages: ["python"], agentEnergyPerSecond: 1, agentBatteryActs: 2, startingEnergy: 100, energyPerSecond: 1, maxAgentsPerGod: 4,
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
