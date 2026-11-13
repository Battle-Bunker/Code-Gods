/**
 * A game that allows several agent languages. What would break: a language the game does not allow being validated or
 * summoned, an agent run by the default language's sandbox instead of its own (it would fail to compile and never
 * transform anything), its summon price counted in the wrong language, or the observation not telling players which
 * languages they may use.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, PY, raw, roomWith, startGame, touch, TS, waitFor } from "./game-helpers.ts";

const INT = { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, spawnRateHz: 0, planningSeconds: 3600, startingObjectCount: 4,
  powerPerSecond: 2000, interactionRateHz: 40, halfLifeSeconds: 1e9 };

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
  // Language-fair (docs/energy-model.md §5.1): the same one-move agent costs about the same in either language. Before
  // TypeScript's structure bits were weighted it cost about 1.5 times Python's.
  const same = { python: "def agent(n):\n    return [add(1)]", typescript: "function agent(n) { return [add(1)]; }" };
  const pyPrice = (await send(ada, { type: "validate", language: "python", source: same.python })).validation.cost;
  const tsPrice = (await send(bo, { type: "validate", language: "typescript", source: same.typescript })).validation.cost;
  assert.ok(tsPrice / pyPrice > 0.6 && tsPrice / pyPrice < 1.2, `TypeScript ${tsPrice} against Python ${pyPrice}`);
  // Python source sent as TypeScript does not compile: the language decides the sandbox.
  assert.equal((await send(ada, { type: "validate", language: "typescript", source: PY.Int })).validation.valid, false);

  assert.equal((await send(ada, { type: "summon", name: "Test agent", language: "python", source: PY.Int })).accepted, true);
  assert.equal((await send(bo, { type: "summon", name: "Test agent", language: "typescript", source: TS.Int })).accepted, true);
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

test("a TypeScript agent is compiled by another action; its program and its compile failure are stored for every action", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Ts Host", "Ts Ada", "Ts Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["typescript"] });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  // Sources new to this run (a comment), so this run compiles them and stores the newest rows.
  const run = Date.now(), source = `${TS.Int}\n// run ${run}\n`, broken = `function agent(x) { return [add(x +]; }\n// run ${run}\n`;
  const validated = await send({ type: "validate", language: "typescript", source });
  assert.equal(validated.validation.valid, true, JSON.stringify(validated));
  const failed = await send({ type: "validate", language: "typescript", source: broken });
  assert.equal(failed.validation.valid, false);
  // runtime/compile.ts stored both outcomes; a second validation of the broken source reports the same, without compiling.
  const [failure, stored] = await admin.query(internal.testing.compiledProgramsLatest, { count: 2 });
  assert.ok(!stored.error && stored.chars > 0, "the program is stored");
  assert.equal(stored.inspection.complexityFunctionId, "ts-ast-bits-v1-uniform");
  assert.equal(failure.error?.code, "COMPILE");
  assert.deepEqual((await send({ type: "validate", language: "typescript", source: broken })).validation, failed.validation);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a language the game does not allow is refused at validate and summon", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Only Host", "Only Ada", "Only Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["typescript"] });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  for (const type of ["validate", "summon"]) {
    const refused = await send({ type, ...(type === "summon" ? { name: "N" } : {}), language: "python", source: PY.Int });
    assert.equal(refused.accepted, false, type);
    assert.match(refused.message, /does not allow python agents \(allowed: typescript\)/, type);
  }
  assert.equal((await raw(game.gameId)).agents.length, 0);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("Haskell is retired: a game's Haskell agent sits out and still observes", { timeout: 180_000 }, async () => {
  const [host, ada, bo] = await gods("Old Host", "Old Ada", "Old Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...INT, languages: ["typescript"] });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  assert.equal((await send({ type: "summon", name: "Old agent", language: "typescript", source: TS.Int })).accepted, true);
  const [agent] = (await raw(game.gameId)).agents;
  // As if summoned in Haskell before it was retired (its stored language is history).
  await admin.mutation(internal.testing.patchAgentLanguage, { agentId: agent._id, language: "haskell" });
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await new Promise(resolve => setTimeout(resolve, 8000));
  const after = await raw(game.gameId);
  assert.equal(after.agents[0].acts, 0, "it never acts, and is never charged");
  assert.deepEqual(after.batches.flatMap((b: any) => b.events).filter((e: any) => e.agentId === agent._id && (e.t === "transform" || e.t === "fail")), []);
  const obs = await ada.c.query(api.player.observation, { roomId });
  assert.equal(obs.agents[0].language, "haskell", "the player still sees their agent, as it was");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
