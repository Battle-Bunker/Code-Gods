/**
 * A game that allows several agent languages. What would break: a language the game does not allow being validated or
 * summoned, an agent run by the default language's sandbox instead of its own (it would fail to compile and never
 * transform anything), its summon price counted in the wrong language, or the observation not telling players which
 * languages they may use.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, HS, internal, PY, raw, roomWith, startGame, touch, TS, waitFor } from "./game-helpers.ts";

const INT = { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, spawnRateHz: 0, planningSeconds: 3600, startingObjectCount: 4,
  agentEnergyPerSecond: 1000, agentBatteryActs: 1000, interactionRateHz: 40, halfLifeSeconds: 1e9 };

test("each agent is written in one of the game's languages, priced and run in its own", { timeout: 180_000 }, async () => {
  const [host, ada, bo] = await gods("Lang Host", "Lang Ada", "Lang Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["typescript", "python"] });
  const game = await startGame(host, roomId);
  const send = (god: typeof host, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });

  const obs = await ada.c.query(api.player.observation, { roomId });
  assert.deepEqual([obs.languages, obs.language], [["typescript", "python"], "typescript"], "the allowed set, and its first as the default");

  // The second allowed language is priced by its own summon-price function (Python's ast-bits-v1).
  const validated = await send(ada, { type: "validate", language: "python", source: PY.Int });
  assert.equal(validated.accepted, true, validated.message);
  assert.match(validated.validation.diagnostics[0], /\(ast-bits-v1:/);
  const tsValidated = await send(bo, { type: "validate", language: "typescript", source: TS.Int });
  assert.match(tsValidated.validation.diagnostics[0], /\(ts-ast-bits-v1-uniform:/);
  // Python source sent as TypeScript does not compile: the language decides the sandbox.
  assert.equal((await send(ada, { type: "validate", language: "typescript", source: PY.Int })).validation.valid, false);

  assert.equal((await send(ada, { type: "summon", language: "python", source: PY.Int })).accepted, true);
  assert.equal((await send(bo, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  const mine = await ada.c.query(api.player.observation, { roomId });
  assert.deepEqual(mine.agents.map((a: any) => a.language), ["python"], "an agent carries its own language");

  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => {
    const { agents } = await raw(game.gameId);
    return agents.length === 2 && agents.every((a: any) => a.acts >= 2) || undefined;
  }, "both agents act, each in its own sandbox", 90_000);
  const { batches } = await raw(game.gameId);
  const events = batches.flatMap((b: any) => b.events);
  const failedBy = new Set(events.filter((e: any) => e.t === "fail" && !/already has this value|no change/.test(e.reason)).map((e: any) => e.agentId));
  assert.equal(failedBy.size, 0, "no agent fails for running in the wrong language");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a Haskell agent is compiled by MicroHs, priced by hs-token-bits and acts like the others", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Hs Host", "Hs Ada", "Hs Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["haskell", "typescript"] });
  const game = await startGame(host, roomId);
  const send = (god: typeof host, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  // The sandbox boots on first use (a warming answer is retried, as the forge does).
  const validate = async (source: string) => {
    for (;;) {
      const reply = await send(ada, { type: "validate", language: "haskell", source });
      if (reply.accepted || !/warming/i.test(String(reply.message))) return reply;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };
  // Sources new to this run (a comment), so this run compiles them and stores the newest rows.
  const run = Date.now(), source = `${HS.Int}\n-- run ${run}\n`, notHaskell = `${TS.Int}\n// run ${run}\n`;
  const validated = await validate(source);
  assert.equal(validated.accepted, true, validated.message);
  assert.equal(validated.validation.valid, true, JSON.stringify(validated));
  assert.match(validated.validation.diagnostics[0], /\(hs-token-bits-v1-uniform:/);
  // TypeScript source sent as Haskell does not compile.
  const broken = await validate(notHaskell);
  assert.equal(broken.validation.valid, false);
  // Another action compiled both (runtime/haskellCompile.ts) and stored the outcome for every action: the program,
  // and the agent's own compile failure, which a second validation reports the same without compiling again.
  const [failure, stored] = await admin.query(internal.testing.haskellProgramsLatest, { count: 2 });
  assert.ok(!stored.error && stored.chars > 1000, "the program is stored");
  assert.equal(stored.inspection.complexityFunctionId, "hs-token-bits-v1-uniform");
  assert.equal(failure.error?.code, "COMPILE");
  assert.deepEqual((await validate(notHaskell)).validation, broken.validation);

  const summoned = await send(ada, { type: "summon", language: "haskell", source });
  assert.equal(summoned.accepted, true, summoned.message);
  assert.equal((await send(bo, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => {
    const { agents } = await raw(game.gameId);
    return agents.length === 2 && agents.every((a: any) => a.acts >= 2) || undefined;
  }, "both agents act", 120_000);
  const { batches, agents } = await raw(game.gameId);
  const haskell = agents.find((a: any) => a.language === "haskell");
  const failed = batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "fail" && e.agentId === haskell._id
    && !/already has this value|no change/.test(e.reason));
  assert.deepEqual(failed, [], "the Haskell agent's moves apply");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a language the game does not allow is refused at validate and summon", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Only Host", "Only Ada", "Only Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["typescript"] });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  for (const type of ["validate", "summon"]) {
    const refused = await send({ type, language: "python", source: PY.Int });
    assert.equal(refused.accepted, false, type);
    assert.match(refused.message, /does not allow python agents \(allowed: typescript\)/, type);
  }
  assert.equal((await raw(game.gameId)).agents.length, 0);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
