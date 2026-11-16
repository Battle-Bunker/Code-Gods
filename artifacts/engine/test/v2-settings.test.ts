/**
 * v1's game settings, restored as room settings (convex/v2/duration.ts, disclose.ts): a halfLife game hides its end
 * while live and ends by itself at the drawn moment; standings are published every `scoreIntervalSeconds`; with
 * `peerNoiseVariance` 0 the others' sums are exact. A value outside the choices is refused.
 *
 * What would break: a halfLife game that discloses its end, ends at its half-life, or never ends; standings on a
 * fixed cadence; a room setting that does not reach the game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";
import { presetOf } from "../convex/v2/presets.ts";

test("halfLife hides the end and ends at the drawn moment; standings every 5 s; noise variance 0 is exact", { timeout: 180_000 }, async () => {
  const [ada] = await humans("Settings Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Settings room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const bad = await perform(ada!, "room.settings", { overrides: { peerNoiseVariance: 8 } }, { roomId }).catch((e: any) => e.data);
  assert.equal(bad.ok, false, "peerNoiseVariance takes one of 0, 4, 16, 64, 256");
  assert.equal((await perform(ada!, "room.settings", { overrides: { durationMode: "halfLife", worldSeconds: 60, scoreIntervalSeconds: 5, peerNoiseVariance: 0 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await admin.mutation("v2/testing:setEnd", { gameId, endAtWorld: 12 });   // the drawn end, made known to the test
  await perform(ada!, "game.startWorldNow", {}, { gameId });

  const live = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([live.phase, live.durationMode, live.worldSeconds, live.scoreIntervalSeconds, live.peerNoiseVariance], ["live", "halfLife", 60, 5, 0]);
  assert.equal(live.endsAt, null, "the end is hidden while live");
  const ids = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: { numItems: 5, cursor: null } })).page;
  for (const { objectId } of ids) {
    const [o, e] = [await ada!.query("v2/play:object", { objectId }), await admin.query("v2/testing:valueOf", { objectId, userId: ada!.userId })];
    if (o.value.version === e.version) assert.ok(Math.abs(o.value.want - e.want) < 1e-9, "no noise at variance 0");
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

test("the beginner game (owner decisions 31, 32, 34): 600 s fixed, 3 objects, exact readings", { timeout: 60_000 }, async () => {
  const [ada] = await humans("Preset Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Preset room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const h = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([h.durationMode, h.worldSeconds, h.peerNoiseVariance, h.peerNoiseBits], ["fixed", 600, 0, 0]);
  // A look at a typical line costs a fiftieth of the power: 5 a second take a tenth (decision 35), at 4 energy a second.
  assert.ok(Math.abs(h.readPriceWeight * 13.7 / 32 - 4 / 50) < 1e-9, `weight ${h.readPriceWeight}`);
  assert.equal(h.priceScale, 4 / 64, "summons at power ÷ 64");
  await perform(ada!, "game.startWorldNow", {}, { gameId });   // the starting objects are born with the world
  const ids = (await ada!.query("v2/spectate:objectIds", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  assert.equal(ids.length, 3, "3 objects to start (decision 31)");
  await perform(ada!, "game.end", {}, { gameId });
  // The derived weight is not a quarter: a client that echoes the preset's own back is accepted (W5).
  const echoed = await perform(ada!, "room.settings", { overrides: { readPriceWeight: h.readPriceWeight } }, { roomId }).catch((e: any) => e.data);
  assert.equal(echoed.ok, true, JSON.stringify(echoed));
});

test("a room dilated by 10 plays the same game ten times faster: 600 world seconds of the preset's settings in about a minute (decision 37)", { timeout: 240_000 }, async () => {
  const [ada] = await humans("Dilated Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Dilated room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 10 });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const h = await ada!.query("v2/games:header", { gameId });
  // The game itself is the preset's: its world lasts 600 s at power 4, 3 opportunities a second, the preset's start.
  assert.deepEqual([h.timeScale, h.planningSeconds, h.worldSeconds, h.scoreIntervalSeconds, h.priceScale], [10, 60, 600, 10, 4 / 64]);
  const settings = await admin.query("v2/testing:settingsOf", { gameId });
  const e = settings.economy;
  // The start is derived from the starters' prices (presets.ts beginnerStart), so it is the preset's, not a constant.
  assert.deepEqual([e.powerPerSecond, e.opportunitiesPerSecond, e.fullChargeSeconds, settings.startingEnergy], [4, 3, 240, presetOf("lines-beginner").startingEnergy]);
  // Planning's 60 world seconds take 6 wall seconds.
  assert.ok(Math.abs((h.planningEndsAt - h.startedAt) / 1000 - 6) < 1, `planning ends ${(h.planningEndsAt - h.startedAt) / 1000} s after the start`);
  const started = Date.now();
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  const live = await ada!.query("v2/games:header", { gameId });
  assert.ok(Math.abs((live.endsAt - started) / 1000 - 60) < 5, `600 world seconds end about 60 wall seconds on: ${(live.endsAt - started) / 1000}`);
  for (let i = 0; (await ada!.query("v2/games:header", { gameId })).phase !== "ended"; i++) {
    assert.ok(i < 300, "the dilated game ends");
    await new Promise(r => setTimeout(r, 500));
  }
  const wall = (Date.now() - started) / 1000;
  assert.ok(wall < 120, `ten minutes of game in about one: ${Math.round(wall)} s`);
  assert.equal((await admin.query("v2/testing:clock", { gameId })).worldSeconds, 600, "the whole world was played");
  // Decision 31's regular births: 3 starting lines, one at 240 and one at 480 s: exactly 5 at the end.
  const lines = (await ada!.query("v2/spectate:objectIds", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  assert.equal(lines.length, 5, "the beginner game ends at 5 lines");
  // Standings every 10 world seconds where the tick allows (a tick covers 15 world seconds at 10×).
  const history = await ada!.query("v2/games:standingsHistory", { gameId, after: -1 });
  const worlds = history.map((r: any) => r.worldSeconds).slice(0, -1);   // the last is the final scoreboard
  assert.ok(worlds.every((w: number, i: number) => i === 0 || w - worlds[i - 1] >= 10 - 1e-9), `ten world seconds apart at least: ${worlds.join(", ")}`);
  assert.ok(history.length >= 25, `published through the whole world: ${history.length} rows to ${worlds.at(-1)}`);
});

test("v1's world, energy and compute settings are room settings: objects, births, world speed, power, fill time, steps and CPU per act", { timeout: 180_000 }, async () => {
  const [ada] = await humans("World Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "World room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  for (const bad of [{ startingObjects: 1001 }, { startingObjects: 2.5 }, { birthsPerSecond: 11 }, { opportunitiesPerSecond: -1 }, { powerPerSecond: 2e6 }, { fullChargeSeconds: 0 }, { stepBudget: 0 }, { interactionComputeMs: 0 }]) {
    const out = await perform(ada!, "room.settings", { overrides: bad }, { roomId }).catch((e: any) => e.data);
    assert.equal(out.ok, false, `refused: ${JSON.stringify(bad)}`);
  }
  const overrides = { startingEnergy: 5000, startingObjects: 5, birthsPerSecond: 0, opportunitiesPerSecond: 10, powerPerSecond: 16, fullChargeSeconds: 60, stepBudget: 1, interactionComputeMs: 500 };
  assert.equal((await perform(ada!, "room.settings", { overrides }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const s = await admin.query("v2/testing:settingsOf", { gameId });
  assert.deepEqual([s.startingObjects, s.economy.birthsPerSecond, s.economy.opportunitiesPerSecond, s.economy.powerPerSecond, s.economy.fullChargeSeconds, s.stepBudget, s.interactionComputeMs],
    [5, 0, 10, 16, 60, 1, 500]);
  const h = await ada!.query("v2/games:header", { gameId });
  assert.equal(h.priceScale, 16 / 64, "prices follow the room's power");
  assert.equal((await perform(ada!, "game.get", {}, { gameId }, "query")).result.me.power, 16, "each player's own power is the room's");
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  const ids = (await ada!.query("v2/spectate:objectIds", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  assert.equal(ids.length, 5, "the room's starting objects");
  // One step per act: every agent's act runs out of steps (the budget reaches the sandbox).
  let limited: any = null;
  for (let i = 0, after = -1; !limited && i < 60; i++) {
    const events = await admin.query("v2/testing:events", { gameId, after });
    if (events.length) after = events.at(-1).seq;
    limited = events.find((e: any) => e.kind === "act" && e.data.code === "LIMIT");
    if (!limited) await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(limited, "an act stopped at the room's step budget");
  assert.match(limited.data.reason, /Step limit exceeded: the agent took more than 1 steps/);
  await perform(ada!, "game.end", {}, { gameId });
});

test("a settings save keeps the room's time dilation (it is set only by setTimeScale, never a room setting)", { timeout: 60_000 }, async () => {
  // Catches: changeSettings replacing the overrides wholesale, so any save in the configure page dropped timeScale.
  const [ada] = await humans("Dilated Saver");
  const { roomId } = (await perform(ada!, "room.create", { name: "Dilated save room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 10 });
  assert.equal((await perform(ada!, "room.settings", { overrides: { worldSeconds: 300 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const h = await ada!.query("v2/games:header", { gameId });
  assert.deepEqual([h.timeScale, h.worldSeconds], [10, 300], "the save applied and the dilation stayed");
  await perform(ada!, "game.end", {}, { gameId });
});
