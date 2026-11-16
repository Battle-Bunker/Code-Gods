/**
 * "Game details" (v1's spectator section: settings, the utility functions dealt, timings; parity `page-game-details`):
 * `v2/games:details`, one game document and, after the end, one index page of its rules. While live it names no
 * player's rule (anyone's rule is private until the end; the families any seat could hold are `rule.candidates`); after
 * the end every seat's rule is public, as in the replay file.
 *
 * What would break: a live read that reveals who holds which rule, or the hidden end of a halfLife game; an ended game
 * whose details miss a seat's rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("while live: settings and timings, no rule of anyone's", async () => {
  const [ada, bo, sy] = await humans("Details Ada", "Details Bo", "Details Sy");
  const { gameId } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId], spectators: [sy!.userId] });
  for (const who of [ada!, sy!]) {
    const d = await who.query("v2/games:details", { gameId });
    assert.equal(d.phase, "live");
    assert.ok(d.settings.worldSeconds > 0 && d.settings.economy.powerPerSecond > 0, JSON.stringify(d.settings));
    assert.equal(d.rules, null, "no rule while live, not even the caller's (that is v2/play:myRule)");
    assert.equal(d.endWorld, null, "the world's end stays hidden while live");
    const text = JSON.stringify(d);
    for (const hidden of ["noiseKey", "endAtWorld", "unopposed", "seed\""]) assert.ok(!text.includes(hidden), `${hidden} is private`);
  }
});

test("after the end: every seat's rule with its name and card, and the timings", async () => {
  const [ada, bo, sy] = await humans("Details End Ada", "Details End Bo", "Details End Sy");
  const { gameId, families } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId], practice: 1, spectators: [sy!.userId], phase: "ended" });
  const d = await sy!.query("v2/games:details", { gameId });
  assert.equal(d.phase, "ended");
  assert.equal(d.rules.length, 3, JSON.stringify(d.rules));
  assert.deepEqual(d.rules.map((r: any) => r.family).sort(), [...families].sort());
  assert.deepEqual(new Set(d.rules.map((r: any) => r.name)), new Set(["Details End Ada", "Details End Bo", d.rules.find((r: any) => r.name !== "Details End Ada" && r.name !== "Details End Bo").name]));
  for (const r of d.rules) assert.ok(r.card.length > 0 && r.title.length > 0 && r.memberId, JSON.stringify(r));
  assert.ok(d.endedAt !== null);
});

test("the end reason (v1's): none while live, the owner's after they end it", async () => {
  const [ada] = await humans("Details Reason Ada");
  const { gameId } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId });
  assert.equal((await ada!.query("v2/games:details", { gameId })).endReason, null);
  await perform(ada!, "game.end", {}, { gameId });
  const d = await ada!.query("v2/games:details", { gameId });
  assert.equal(d.endReason, "owner");
  assert.ok(d.endedAt !== null && d.startedAt !== null);
});

// v1's "Who is here" ✓: which seats are ready. Partners are always ready; a human is once they say so.
test("readiness: every seat's ready flag, a human's only once they mark ready", async () => {
  const [ada] = await humans("Readiness Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Readiness room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const header = await ada!.query("v2/games:header", { gameId });
  const before = await ada!.query("v2/games:readiness", { gameId });
  assert.equal(before.length, header.roster.length);
  for (const r of before) assert.equal(r.ready, r.memberId !== header.me, "partners ready, Ada not yet");
  await perform(ada!, "game.ready", { ready: true }, { gameId });
  assert.ok((await ada!.query("v2/games:readiness", { gameId })).every((r: any) => r.ready));
  await perform(ada!, "game.end", {}, { gameId });
});
