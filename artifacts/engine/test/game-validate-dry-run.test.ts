/**
 * Validation runs the agent (a dry run on the game's own objects and the board's reference objects, with no effect
 * on the game): an agent that raises on its first act is INVALID with the error it raised, never "VALID"; an agent
 * that never moves validates with a warning; a working agent is unchanged (convex/lib/dryRun.ts). A summon of the
 * failing agent still works, and its receipt carries the finding as a warning.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assessValidation } from "../../../lib/player-client/src/validation.ts";
import { api, envelope, gods, raw, roomWith, startGame, touch } from "./game-helpers.ts";

test("validate dry-runs the agent: a runtime error is INVALID with its message, no move is a warning", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Dry Host", "Dry Ada", "Dry Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "mono" }, languages: ["typescript", "python"], startingObjectCount: 8, spawnRateHz: 0, planningSeconds: 3600, startingEnergy: 5000 });
  // Seats the owner whether or not rooms.create already did (that change is in flight on another branch).
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false }).catch(() => undefined);
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const before = JSON.stringify((await raw(game.gameId)).objects.map((o: any) => [o._id, o.value, o.version]));

  // The persona's agent: it compiles, and raises a NameError on every object.
  const broken = await send({ type: "validate", language: "python", source: "def agent(grid):\n    return [slide(line, 1)]\n" });
  assert.equal(broken.accepted, true, broken.message);
  assert.equal(broken.validation.valid, false, "an agent that fails every act is not VALID");
  assert.match(broken.validation.diagnostics[0], /^NameError: name 'line' is not defined/);
  assert.match(broken.validation.diagnostics[1], /every sample object/);
  assert.equal(broken.validation.invalidRate, 1);
  const assessed = assessValidation(broken);
  assert.equal(assessed.verdict, "fails");
  assert.match(assessed.summary, /NameError/);

  const brokenTs = (await send({ type: "validate", language: "typescript", source: "function agent(grid) { const o: any = null; return [slide(row(0), o.step)]; }" })).validation;
  assert.equal(brokenTs.valid, false);
  assert.match(brokenTs.diagnostics[0], /^TypeError/);
  assert.doesNotMatch(brokenTs.diagnostics[0], /agent (raised|threw) an error/);

  // It never moves: still summonable, with a warning.
  const idle = (await send({ type: "validate", language: "python", source: "def agent(grid):\n    return []\n" })).validation;
  assert.equal(idle.valid, true);
  assert.match(idle.warnings.join(" "), /made no move on any sample object\. It may do nothing\./);

  // A working agent is valid, with no dry-run warning.
  const working = (await send({ type: "validate", language: "python", source: "def agent(grid):\n    return [slide(row(0), 1)]\n" })).validation;
  assert.equal(working.valid, true);
  assert.equal(working.warnings, undefined);

  // Summoning the broken agent is not refused (callers that did it before keep working), but the receipt says it.
  const summoned = await send({ type: "summon", name: "Broken", language: "python", source: "def agent(grid):\n    return [slide(line, 1)]\n" });
  assert.equal(summoned.accepted, true, summoned.message);
  assert.match((summoned.warnings ?? []).join(" "), /failed on every sample object, so every act will fail: NameError: name 'line' is not defined/);
  const summonedIdle = await send({ type: "summon", name: "Idle", language: "python", source: "def agent(grid):\n    return []\n" });
  assert.match((summonedIdle.warnings ?? []).join(" "), /made no move on any sample object/);

  // The dry runs changed nothing in the game.
  assert.equal(JSON.stringify((await raw(game.gameId)).objects.map((o: any) => [o._id, o.value, o.version])), before);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
