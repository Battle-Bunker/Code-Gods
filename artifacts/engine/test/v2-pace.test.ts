/**
 * The table (lib/v2-agents runTable, which every dynamics figure comes from) and the engine play a beginner game at the
 * same pace. A practice room of three partners plays `Lines · beginner` on the live local backend, dilated 10× (owner
 * decision 37: the same world in a tenth of the wall time). The table then plays the same rules, seats, languages and
 * economy. Both are measured the way the playtests measure: objects changed per minute, and state-changing moves, by
 * third of the game.
 *
 * What would break: a table whose figures do not describe the real game. Round 26–27: a table reporting busy boards
 * while the engine's went quiet, from a different deal, a different count and every seat in one language.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { sandboxes, startersFor } from "@workspace/v2-agents";
type ShippedLanguage = "typescript" | "python";
import { runTable } from "@workspace/v2-agents/table";
import { lineQ, lineType } from "@workspace/v2-linear";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

const SCALE = 10, THIRDS = 3;
let host: Human, events: any[] = [];

/** Objects changed in each minute, and state-changing moves in each third, from (world second, object) pairs. */
function pace(moves: readonly { at: number; object: number }[], seconds: number) {
  const minutes = Array.from({ length: Math.ceil(seconds / 60) }, (_, m) => new Set(moves.filter(x => x.at >= 60 * m && x.at < 60 * (m + 1)).map(x => x.object)).size);
  const perThird = Array.from({ length: THIRDS }, (_, t) => moves.filter(x => Math.min(THIRDS - 1, Math.floor((THIRDS * x.at) / seconds)) === t).length);
  return { minutes, perThird, quietMinutes: minutes.filter(n => n === 0).length };
}

before(async () => {
  [host] = await humans("pace host");
  const { roomId } = (await perform(host!, "room.create", { name: "pace room", preset: "lines-beginner" })).result;
  await perform(host!, "room.setSpectator", { spectator: true }, { roomId });
  await perform(host!, "seats.fillPracticePartners", {}, { roomId });
  await perform(host!, "room.settings", { overrides: { planningSeconds: 5 } }, { roomId });
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: SCALE });
  const started = await perform(host!, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  const gameId = started.result.gameId, deadline = Date.now() + 240_000;
  for (;;) {
    if ((await host!.query("v2/games:header", { gameId })).phase === "ended") break;
    assert.ok(Date.now() < deadline, "the dilated game ends within 4 minutes");
    await new Promise(r => setTimeout(r, 1000));
  }
  for (let last = -1; ;) {
    const page = await admin.query("v2/testing:events", { gameId, after: last });
    if (page.length === 0) break;
    events.push(...page);
    last = page.at(-1).seq;
  }
}, { timeout: 300_000 });

const boxes = sandboxes();
after(() => boxes.close());

test("the table plays the engine's beginner game at the engine's pace: objects changed per minute and moves per third agree", async () => {
  const start = events.find(e => e.kind === "gameStarted")!.data, s = start.settings, seconds = s.worldSeconds as number;
  const language = new Map<string, ShippedLanguage>(events.filter(e => e.kind === "command" && e.data.kind === "summon").map(e => [e.data.memberId, e.data.language]));
  const engine = pace(events.filter(e => e.kind === "act" && e.data.outcome === "committed" && e.data.after !== e.data.before).map(e => ({ at: e.data.worldSeconds, object: e.data.number })), seconds);

  // The same game in the table: the dealt rules, each seat's language, the preset's economy and board.
  const seats = start.players.map((p: any, k: number) => {
    const lang = language.get(p.memberId) ?? "typescript";
    return { name: `P${k}`, kind: "starter" as const, rule: { family: p.family, params: p.params, tieBreaker: p.tieBreaker }, program: { language: lang, source: startersFor(p.family, lang).find(a => a.kind === "simple")!.source } };
  });
  const tables: ReturnType<typeof pace>[] = [];
  for (const seed of ["pace-a", "pace-b", "pace-c"]) {
    const moves: { at: number; object: number }[] = [];
    await runTable(boxes, {
      type: lineType, variant: lineQ, lines: s.startingObjects, seed, seconds, seats, unique: true,
      economy: { ...s.economy, startingEnergy: s.startingEnergy ?? 100 }, birthsPerSecond: s.economy.birthsPerSecond, summonCap: s.startingEnergy ?? 100,
      ...(s.driftSeconds ? { driftSeconds: s.driftSeconds } : {}),
      onAct: e => { if (e.committed) moves.push({ at: e.at, object: e.object + 1 }); },
    });
    tables.push(pace(moves, seconds));
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tableThirds = [0, 1, 2].map(t => mean(tables.map(x => x.perThird[t]!)));
  const tableObjects = mean(tables.map(x => mean(x.minutes))), engineObjects = mean(engine.minutes);
  const report = `engine ${engine.perThird.join("/")} moves by third, ${engineObjects.toFixed(2)} objects a minute, ${engine.quietMinutes} quiet minutes; ` +
    `table ${tableThirds.map(x => x.toFixed(0)).join("/")}, ${tableObjects.toFixed(2)}, ${mean(tables.map(x => x.quietMinutes)).toFixed(1)}`;
  console.log(report);
  // One engine game against three table games of the same deal: the same order of magnitude, third by third (a factor
  // of 3 either way, plus a few moves), and objects changed per minute within one object.
  for (let t = 0; t < THIRDS; t++) {
    const e = engine.perThird[t]!, x = tableThirds[t]!;
    assert.ok(x <= 3 * e + 10 && e <= 3 * x + 10, `third ${t + 1}: ${report}`);
  }
  assert.ok(Math.abs(tableObjects - engineObjects) <= 1, report);
});
