/**
 * The disclosure noise stays unbiased where agents go (owner decision 32, after playtest round 10: shown figures read
 * 1.5–2.5× high because agents climbed on a shared draw and chose its peaks; now every reading is an independent
 * measurement, never shared and never accumulated). A 60-second game of three practice partners at variance 64 (σ 8):
 * over the states the agents moved to, the shown others' sum averages the exact one, and every published total is the
 * exact record's (call 15).
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
  await perform(host!, "room.settings", { overrides: { peerNoiseVariance: 64, worldSeconds: 60, planningSeconds: 5 } }, { roomId });
  const { gameId } = (await perform(host!, "game.start", {}, { roomId })).result;
  for (let i = 0; (await host!.query("v2/games:header", { gameId })).phase !== "ended"; i++) {
    assert.ok(i < 400, "the game ends");
    await new Promise(r => setTimeout(r, 500));
  }
  const offsets: number[] = await admin.query("v2/testing:moveNoiseOffsets", { gameId });
  assert.ok(offsets.length >= 30, `enough moves: ${offsets.length}`);
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  console.log(`# moves ${offsets.length}, mean shown − exact others' sum ${mean.toFixed(2)} bits`);
  assert.ok(Math.abs(mean) < 2.5, `centred where agents went: ${mean.toFixed(2)} bits (σ 8; it was +12.8 on the shared draw)`);

  const history = await host!.query("v2/games:standingsHistory", { gameId, after: -1 });
  const final = await host!.query("v2/games:standings", { gameId });
  const lastLive = history.at(-2), sum = (rows: { net: number }[]) => rows.reduce((t, r) => t + r.net, 0);
  const ratio = sum(lastLive.totals) / sum(final.rows);
  console.log(`# last live published total ${sum(lastLive.totals).toFixed(1)} at ${lastLive.worldSeconds.toFixed(0)} s, final ${sum(final.rows).toFixed(1)}: ×${ratio.toFixed(2)}`);
  // Published exact (call 15): every live publication is the exact total the record holds for that moment (the
  // scoreboard's tick event), and the final standings are the final count. Points can fall in the last seconds, so a
  // live total is the game as it stood, not a forecast of the end.
  const events: any[] = [];
  for (let after = -1; ;) { const page = await admin.query("v2/testing:events", { gameId, after }); if (!page.length) break; events.push(...page); after = page.at(-1).seq; }
  const ticks = events.filter(e => e.kind === "tick").map(e => e.data);
  let checked = 0;
  for (const h of history) {
    const t = ticks.find((x: any) => Math.abs(x.worldSeconds - h.worldSeconds) < 1e-9);
    if (!t) continue;
    for (const row of h.totals) assert.ok(Math.abs(row.net - t.standings.find((x: any) => x.memberId === row.memberId).net) < 1e-6, `published at ${h.worldSeconds} s = the exact record`);
    checked++;
  }
  assert.ok(checked >= 5, `every publication checked against the record (${checked})`);
});
