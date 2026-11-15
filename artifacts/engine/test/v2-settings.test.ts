/**
 * v1's game settings, restored as room settings (convex/v2/duration.ts, disclose.ts): a halfLife game hides its end
 * while live and ends by itself at the drawn moment; standings are published every `scoreIntervalSeconds`; with
 * `peerNoiseBits` 0 the others' sums are exact. A value outside the choices is refused.
 *
 * What would break: a halfLife game that discloses its end, ends at its half-life, or never ends; standings on a
 * fixed cadence; a room setting that does not reach the game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("halfLife hides the end and ends at the drawn moment; standings every 5 s; peerNoiseBits 0 is exact", { timeout: 180_000 }, async () => {
  const [ada] = await humans("Settings Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Settings room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const bad = await perform(ada!, "room.settings", { overrides: { peerNoiseBits: 3 } }, { roomId }).catch((e: any) => e.data);
  assert.equal(bad.ok, false, "peerNoiseBits takes one of 0, 2, 4, 8, 16");
  assert.equal((await perform(ada!, "room.settings", { overrides: { durationMode: "halfLife", worldSeconds: 60, scoreIntervalSeconds: 5, peerNoiseBits: 0 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await admin.mutation("v2/testing:setEnd", { gameId, endAtWorld: 12 });   // the drawn end, made known to the test
  await perform(ada!, "game.startWorldNow", {}, { gameId });

  const live = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([live.phase, live.durationMode, live.worldSeconds, live.scoreIntervalSeconds, live.peerNoiseBits], ["live", "halfLife", 60, 5, 0]);
  assert.equal(live.endsAt, null, "the end is hidden while live");
  const ids = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: { numItems: 5, cursor: null } })).page;
  for (const { objectId } of ids) {
    const [o, e] = [await ada!.query("v2/play:object", { objectId }), await admin.query("v2/testing:valueOf", { objectId, userId: ada!.userId })];
    if (o.value.version === e.version) assert.ok(Math.abs(o.value.want - e.want) < 1e-9, "no noise at peerNoiseBits 0");
  }

  for (let i = 0; (await ada!.query("v2/games:header", { gameId })).phase !== "ended"; i++) {
    assert.ok(i < 120, "the game ends by itself");
    await new Promise(r => setTimeout(r, 500));
  }
  const events = await admin.query("v2/testing:events", { gameId, after: -1 });
  const end = events.find((e: any) => e.kind === "gameEnded") ?? (await admin.query("v2/testing:events", { gameId, after: events.at(-1).seq })).find((e: any) => e.kind === "gameEnded");
  assert.ok(Math.abs(end.data.worldSeconds - 12) < 0.5, `it ended at the drawn 12 s, not at its 60 s half-life: ${end.data.worldSeconds}`);
  const ended = await ada!.query("v2/games:header", { gameId });
  assert.ok(ended.endsAt !== null, "after the end, when it ended is no secret");
  const history = await ada!.query("v2/games:standingsHistory", { gameId, after: -1 });
  const worlds = history.map((h: any) => Math.round(h.worldSeconds));
  // Published at 0, then on the first commit at least 5 world seconds on (ticks land about a second apart), and at the
  // end: the old fixed cadence would have published nothing before 10.
  assert.ok(worlds[0] === 0 && worlds.some((w: number) => w >= 5 && w < 8), `standings every 5 world seconds: ${worlds.join(", ")}`);
});

test("the beginner presets are v1's Annotated basics: 300 s fixed, no disclosure noise", { timeout: 60_000 }, async () => {
  const [ada] = await humans("Preset Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Preset room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const h = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([h.durationMode, h.worldSeconds, h.peerNoiseBits], ["fixed", 300, 0]);
  await perform(ada!, "game.end", {}, { gameId });
});
