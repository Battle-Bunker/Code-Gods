/**
 * Line turnover both ways: the table (lib/v2-agents runTable, `objectCap`), which every dynamics figure comes from, and
 * the engine (room setting `liveCap`) give the same game. Three seated humans with no agents play `Lines · beginner`
 * with turnover on (a birth every 10 s, at most 4 live), dilated 10×; the table plays the same seed, rules and schedule
 * with seats whose program never moves. With nobody moving, everything is the schedule and the rules, so the two must
 * agree exactly: the same lines born in the same states, the same lines retiring in the same order at the same
 * moments (to a tick), the same points banked on each, and the same totals.
 *
 * What would break: a table whose turnover figures do not describe the engine's game (the round 26–27 lesson,
 * v2-pace.test.ts): a different retirement order, a retirement at a different birth, points counted differently.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { sandboxes } from "@workspace/v2-agents";
import { runTable } from "@workspace/v2-agents/table";
import { births } from "@workspace/v2-agents/pure";
import { lineType } from "@workspace/v2-linear";
import { admin, humans, perform } from "./v2-helpers.ts";
import { encode, typeOf, valueObjects, variantOf } from "../convex/v2/world.ts";

const CAP = 4, BIRTH = 10, WORLD = 120, SCALE = 10;
/** A table tick is 1.5 world seconds and an engine tick about a second of wall time (10 world seconds here): a birth
 *  lands on the first tick of each at or after its moment. */
const TICK_TOLERANCE = 1.5 + SCALE * 1.5;
let events: any[] = [], game: any, totals: Record<string, number>;

before(async () => {
  const [ada, bo, cy] = await humans("Both Ada", "Both Bo", "Both Cy");
  const created = await perform(ada!, "room.create", { name: "Both ways", preset: "lines-beginner" });
  const roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  await perform(cy!, "room.join", { code: created.result.code });
  const set = await perform(ada!, "room.settings", { overrides: { planningSeconds: 5, worldSeconds: WORLD, liveCap: CAP, birthSeconds: BIRTH, driftSeconds: 0 } }, { roomId });
  assert.equal(set.ok, true, JSON.stringify(set));
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: SCALE });
  const started = await perform(ada!, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  const gameId = started.result.gameId;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  const deadline = Date.now() + 180_000;
  while ((await ada!.query("v2/games:header", { gameId })).phase !== "ended") {
    assert.ok(Date.now() < deadline, "the dilated game ends within 3 minutes");
    await new Promise(r => setTimeout(r, 1000));
  }
  for (let last = -1; ;) {
    const page = await admin.query("v2/testing:events", { gameId, after: last });
    if (page.length === 0) break;
    events.push(...page);
    last = page.at(-1).seq;
  }
  game = await admin.query("v2/testing:header", { gameId });
  totals = (await admin.query("v2/testing:totalsOf", { gameId })).exact;
}, { timeout: 240_000 });

const boxes = sandboxes();
after(() => boxes.close());

test("table and engine agree on turnover: births, retirements, banked points and totals", async () => {
  assert.equal(events.filter(e => e.kind === "act").length, 0, "nobody acts on the engine");
  const start = events.find(e => e.kind === "gameStarted")!.data;
  const roster: string[] = start.players.map((p: any) => p.memberId);
  const seats = start.players.map((p: any, k: number) => ({
    name: `P${k}`, kind: "starter" as const, rule: { family: p.family, params: p.params, tieBreaker: p.tieBreaker },
    program: { language: "typescript" as const, source: "function agent(offer) { return null; }" },
  }));
  const type = typeOf(game.variant) as typeof lineType, variant = variantOf(game.variant);
  const retired: { at: number; number: number; points: Record<string, number> }[] = [];
  const report = await runTable(boxes, {
    type, variant, lines: game.settings.startingObjects, seed: game.seed, seconds: WORLD, seats, unique: true, valueObjects: valueObjects(game.settings),
    economy: { ...game.settings.economy, startingEnergy: game.settings.startingEnergy }, birthsPerSecond: 1 / BIRTH, regularBirths: true,
    objectCap: CAP, summonCap: game.settings.startingEnergy,
    onRetire: e => retired.push({ at: e.at, number: e.object + 1, points: Object.fromEntries(roster.map((m, i) => [m, e.points[i]!])) }),
  });

  // Births: the same lines in the same states (the table's birth walk; the engine places the first free draw of it).
  const born = events.filter(e => e.kind === "objectBorn");
  assert.equal(born.length, report.objects, "as many lines born");
  // The table's birth walk (lib/v2-agents births), in the engine's wire form.
  const wire = (s: unknown) => encode(s, game.variant);
  const starting = births(type, variant, game.seed, game.settings.startingObjects).map(wire);
  for (const e of born) {
    const expected = e.data.number <= starting.length ? starting[e.data.number - 1] : wire(births(type, variant, `${game.seed}:${e.data.number}`, 1)[0]!);
    assert.equal(e.data.state, expected, `line ${e.data.number}'s state`);
  }

  // Retirements: the same lines, in the same order, at the same births, with the same points banked.
  const engine = events.filter(e => e.kind === "retired");
  assert.deepEqual(engine.map(e => e.data.number), retired.map(r => r.number), "the same lines retire in the same order");
  assert.ok(engine.length >= 6, `${engine.length} retirements`);
  for (const [i, e] of engine.entries()) {
    assert.ok(Math.abs(e.data.worldSeconds - retired[i]!.at) <= TICK_TOLERANCE, `line ${e.data.number}: engine ${e.data.worldSeconds} s, table ${retired[i]!.at} s`);
    for (const p of e.data.points) assert.ok(Math.abs(p.points - retired[i]!.points[p.memberId]!) < 1e-6, `line ${e.data.number}, ${p.memberId}: engine ${p.points}, table ${retired[i]!.points[p.memberId]}`);
  }

  // Totals: banked and live together, the same at the end.
  for (const [i, m] of roster.entries()) assert.ok(Math.abs(totals[m]! - report.seats[i]!.end) < 1e-6, `seat ${i}: engine ${totals[m]}, table ${report.seats[i]!.end}`);
});
