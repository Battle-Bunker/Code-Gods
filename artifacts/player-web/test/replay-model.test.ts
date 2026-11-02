/**
 * The replay view's pure parts (src/core/replay/model.ts): deep-link parameters (docs/replay-design.md §7) and the
 * sentence each event reads as in the timeline. What would break: a link that does not reopen the same moment (e wins
 * over t, bad numbers ignored), a speed outside the offered set, the share link dropping the page's other parameters,
 * an event sentence that loses who acted or what changed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SPEEDS, cursorAtFraction, describeEvent, endedGameReplay, parseReplayParams, replaySearch, shortId } from "../src/core/replay/model.ts";

test("deep-link parameters: an exact event wins over a world time; junk is ignored; speeds are the offered ones", () => {
  assert.deepEqual(parseReplayParams("?t=12.5&speed=4&play=1&as=god-b"), { t: 12.5, speed: 4, play: true, as: "god-b" });
  assert.deepEqual(parseReplayParams("?e=40&t=9"), { e: 40, speed: 2, play: false });
  assert.deepEqual(parseReplayParams("?e=-3&t=abc&speed=3"), { speed: 2, play: false });
  assert.ok(SPEEDS.includes(2) && SPEEDS.includes(64) && !SPEEDS.includes(3));
});

test("the share link keeps the page's other parameters and writes only the position, the speed and the point of view", () => {
  assert.equal(replaySearch("?panels=off&t=1&play=1", { e: 12, speed: 2 }), "?panels=off&e=12");
  assert.equal(replaySearch("", { e: 0, speed: 8, as: "g2" }), "?e=0&speed=8&as=g2");
  assert.equal(parseReplayParams(replaySearch("?x=1", { e: 5, speed: 16 })).e, 5);
});

test("event sentences name the god behind every move and what changed", () => {
  const names = new Map([["g1", "Ada"], ["g2", "Bo"]]);
  const charge = { decision: 1, erasure: 0, motion: 0, floor: 0, total: 1.5, naming: 1 };
  assert.equal(shortId("j57abcd1234"), "1234");
  assert.equal(describeEvent({ type: "agent.summoned", agentId: "aaaa1234", ownerId: "g1", worldSeconds: 0, language: "python", source: "x", summonCost: 30.25,
    decisionBits: 4, expectedActCost: 2, perActFloorBits: 0, breakdown: { decision: 1, erasure: 0, motion: 0, floor: 0 }, randomized: false,
    account: { balance: 0, settledWorldSeconds: 0 } }, names), "Ada summoned agent 1234 (python, 30.3 bits)");
  assert.equal(describeEvent({ type: "object.transformed", objectId: "obj9999", before: 1, value: 2, version: 3, worldSeconds: 1, agentId: "bbbb5678", ownerId: "g2",
    calls: [["add", { k: 1 }]], cost: charge, net: [1, 2] }, names), "Bo's agent 5678 changed object 9999: add(k=1)");
  assert.equal(describeEvent({ type: "agent.failed", objectId: "obj9999", agentId: "bbbb5678", ownerId: "g2", worldSeconds: 1, reason: "another object already has this value", cost: charge }, names),
    "Bo's agent 5678 failed on object 9999: another object already has this value");
  assert.equal(describeEvent({ type: "phase", phase: "paused", worldSeconds: 3, reason: "paused by Bo" }, names), "Paused: paused by Bo");
  assert.equal(describeEvent({ type: "object.spawned", objectId: "obj7777", value: 5, version: 0, worldSeconds: 2, net: [0, 0] }, names), "Object 7777 appeared");
  assert.equal(describeEvent({ type: "agent.destroyed", agentId: "aaaa1234", ownerId: "g1", worldSeconds: 4 }, names), "Ada destroyed agent 1234");
});

test("the scrub track maps a pointer's position to an event: clamped to the log, rounded to the nearest event", () => {
  assert.equal(cursorAtFraction(0, 120), 0);
  assert.equal(cursorAtFraction(1, 120), 120);
  assert.equal(cursorAtFraction(0.5, 120), 60);
  assert.equal(cursorAtFraction(0.504, 120), 60);
  assert.equal(cursorAtFraction(-0.3, 120), 0, "left of the track is the start");
  assert.equal(cursorAtFraction(1.7, 120), 120, "right of the track is the end");
  assert.equal(cursorAtFraction(Number.NaN, 120), 0);
  assert.equal(cursorAtFraction(0.5, 0), 0, "an empty log has one position");
});

test("the room page offers the replay of its game once that game has ended, and only then", () => {
  assert.deepEqual(endedGameReplay({ phase: "ended", gameShortCode: "G7KQ" }), { game: "G7KQ" });
  assert.equal(endedGameReplay({ phase: "running", gameShortCode: "G7KQ" }), null, "a live game has no replay");
  assert.equal(endedGameReplay({ phase: "lobby" }), null, "a room that never played");
  assert.equal(endedGameReplay({ phase: "ended" }), null, "no game to open");
  assert.equal(endedGameReplay(undefined), null, "still connecting");
});
