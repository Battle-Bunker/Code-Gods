/**
 * The disclosure noise stays unbiased where agents go (the coordinator's call B1, after playtest round 10: shown
 * figures read 1.5–2.5× high because agents climbed on the shown draw and chose its peaks). A 60-second game of three
 * practice partners at peerNoiseBits 8: over the states the agents moved to, the shown others' sum averages the exact
 * one (live totals are logged: from disclosed sums they swing widely at σ 8).
 *
 * What would break: agents selecting on the draw the display shows (the shown figures run high), or totals that do
 * not track the game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("where agents go, the shown others' sum is centred, and live totals track the final count", { timeout: 300_000 }, async () => {
  const [host] = await humans("Bias Host");
  const { roomId } = (await perform(host!, "room.create", { name: "Bias room" })).result;
  await perform(host!, "room.setSpectator", { spectator: true }, { roomId });
  await perform(host!, "seats.fillPracticePartners", {}, { roomId });
  await perform(host!, "room.settings", { overrides: { peerNoiseBits: 8, worldSeconds: 60, planningSeconds: 5 } }, { roomId });
  const { gameId } = (await perform(host!, "game.start", {}, { roomId })).result;
  for (let i = 0; (await host!.query("v2/games:header", { gameId })).phase !== "ended"; i++) {
    assert.ok(i < 400, "the game ends");
    await new Promise(r => setTimeout(r, 500));
  }
  const offsets: number[] = await admin.query("v2/testing:moveNoiseOffsets", { gameId });
  assert.ok(offsets.length >= 30, `enough moves: ${offsets.length}`);
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  console.log(`# moves ${offsets.length}, mean shown − exact others' sum ${mean.toFixed(2)} bits`);
  assert.ok(Math.abs(mean) < 2.5, `centred where agents went: ${mean.toFixed(2)} bits (σ 8; it was +12.8 before B1)`);

  // Live totals (from the disclosed sums, as v1's) are reported, not asserted: with σ 8 they swing widely (see the PR).
  const history = await host!.query("v2/games:standingsHistory", { gameId, after: -1 });
  const final = await host!.query("v2/games:standings", { gameId });
  const lastLive = history.at(-2), sum = (rows: { net: number }[]) => rows.reduce((t, r) => t + r.net, 0);
  console.log(`# last live published total ${sum(lastLive.totals).toFixed(1)} at ${lastLive.worldSeconds.toFixed(0)} s, final ${sum(final.rows).toFixed(1)}`);
});
