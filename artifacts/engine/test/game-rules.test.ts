/**
 * Engine rules (ported from api-server game-integration): uniqueness (duplicates fail but pay decision +
 * floor), pause and its epoch (world time frozen, in-flight windows discarded, god energy accrues),
 * idempotent receipts, permissions (read/act/owner credentials, room binding, spectators), chat limits,
 * energy and the agent cap, and the season commitment.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, playerClient, raw, rejects, roomWith, sleep, touch, TS, waitFor } from "./game-helpers.ts";

const INT_TS = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, spawnRateHz: 0, planningSeconds: 3600,
};

async function runningGame(settings: Record<string, unknown> = {}) {
  const trio = await gods("Rule Host", "Rule Ada", "Rule Bo");
  await touch(trio[0]);
  const { roomId, shortCode } = await roomWith(trio, { ...INT_TS, ...settings });
  const game = await trio[0].c.action(api.owner.start, { roomId });
  const send = (god: (typeof trio)[number], command: Record<string, unknown>, gameId: string | undefined = game.gameId) =>
    god.c.action(api.commands.submit, { roomId, envelope: envelope(command, gameId) });
  const run = () => admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  return { trio, roomId, shortCode, game, send, run };
}

test("objects stay unique: a constant transformation commits once, then collides and still pays decision + floor", { timeout: 120000 }, async () => {
  const { trio: [host, ada], roomId, game, send, run } = await runningGame({ startingObjectCount: 3, agentEnergyPerSecond: 1000, agentBatteryActs: 1000, interactionRateHz: 40 });
  assert.equal((await send(ada, { type: "summon", language: "typescript", source: "function agent(x) { return [setTo(5)]; }" })).accepted, true);
  await run();
  const events = async () => (await raw(game.gameId)).batches.flatMap((b: any) => b.events);
  await waitFor(async () => (await events()).filter((e: any) => e.t === "fail" && /already has this value/.test(e.reason)).length >= 3, "later constant acts collide", 60000);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const secret = await raw(game.gameId);
  const values = secret.objects.map((o: any) => o.value);
  assert.equal(new Set(values).size, values.length);
  assert.equal(values.filter((v: number) => v === 5).length, 1, "only the first constant transformation can succeed");
  const all = await events();
  assert.equal(all.filter((e: any) => e.t === "transform").length, 1);
  const failed = all.filter((e: any) => e.t === "fail");
  const odd = failed.filter((e: any) => !(/already has this value|no change/.test(e.reason) && e.cost.erasure === 0 && e.cost.motion === 0 && e.cost.total === e.cost.decision + e.cost.floor));
  assert.deepEqual(odd, [], "duplicates fail and pay decision + floor only");
  const agent = secret.agents[0];
  assert.equal(agent.acts, all.filter((e: any) => e.t === "transform" || e.t === "fail").length, "every act is charged, successful or not");
});

test("pause: once per god, freezes world time, discards in-flight windows, god energy keeps accruing; resumes at its end", { timeout: 120000 }, async () => {
  const { trio: [host, ada, bo], game, send, run } = await runningGame({ startingObjectCount: 4, agentEnergyPerSecond: 1000, agentBatteryActs: 1000, pauseSeconds: 60, energyPerSecond: 5 });
  assert.equal((await send(ada, { type: "pause" })).accepted, false, "no pause during planning");
  assert.equal((await send(host, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  await run();
  await waitFor(async () => (await raw(game.gameId)).agents[0].acts >= 3, "acting before the pause", 60000);
  const paused = await send(ada, { type: "pause" });
  assert.equal(paused.accepted, true, paused.message);
  assert.equal((await send(ada, { type: "pause" })).accepted, false, "each god pauses once");
  let secret = await raw(game.gameId);
  assert.equal(secret.game.phase, "paused");
  const frozen = { world: secret.game.worldSeconds, acts: secret.agents[0].acts, epoch: secret.game.executionEpoch };
  const energy0 = (await bo.c.query(api.player.observation, { roomId: secret.game.roomId })).self.energy;
  await sleep(2000);
  secret = await raw(game.gameId);
  assert.equal(secret.game.worldSeconds, frozen.world, "paused world time stays frozen");
  assert.equal(secret.agents[0].acts, frozen.acts, "no act commits while paused (in-flight windows are discarded)");
  const obs = await bo.c.query(api.player.observation, { roomId: secret.game.roomId });
  assert.equal(obs.phase, "paused");
  assert.ok(obs.self.energy >= energy0 + 5, "god energy accrues on the wall clock even while paused");
  assert.ok(secret.batches.some((b: any) => b.events.some((e: any) => e.t === "phase" && e.phase === "paused")));
  // The pause ends at its deadline and the loop resumes by itself.
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { pauseEndsAt: Date.now() }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).agents[0].acts > frozen.acts, "acting again after the pause", 60000);
  secret = await raw(game.gameId);
  assert.equal(secret.game.phase, "running");
  assert.ok(secret.game.worldSeconds >= frozen.world);
  assert.ok(secret.game.executionEpoch > frozen.epoch - 1);
  assert.equal((await send(bo, { type: "pause" })).accepted, true, "another god still has its pause");
});

test("receipts: identical envelopes replay the receipt, reused ids with other content fail, rejections are receipted", { timeout: 120000 }, async () => {
  const { trio: [host, ada], roomId, game } = await runningGame({ startingObjectCount: 2 });
  const summon = envelope({ type: "summon", language: "typescript", source: TS.Int }, game.gameId);
  const first = await ada.c.action(api.commands.submit, { roomId, envelope: summon });
  assert.equal(first.accepted, true, first.message);
  assert.deepEqual(await ada.c.action(api.commands.submit, { roomId, envelope: summon }), first);
  assert.equal((await raw(game.gameId)).agents.length, 1, "a replay does not summon twice");
  assert.match(await rejects(ada.c.action(api.commands.submit, { roomId, envelope: { ...summon, command: { ...summon.command, source: "function agent(x) { return []; }" } } })), /reused/);
  assert.deepEqual(await ada.c.query(api.receipts.get, { roomId, commandId: summon.commandId }), first);
  assert.equal(await host.c.query(api.receipts.get, { roomId, commandId: summon.commandId }), null, "receipts are per god");
  const pause = envelope({ type: "pause" }, game.gameId);
  const refused = await ada.c.action(api.commands.submit, { roomId, envelope: pause });
  assert.equal(refused.accepted, false);
  assert.deepEqual(await ada.c.action(api.commands.submit, { roomId, envelope: pause }), refused, "a rejection is receipted too");
  assert.equal((await ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "pause" }, "not-this-game") })).message, "Stale game");
  assert.equal((await ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "pause" }) })).message, "Game ID is required");
  assert.match(await rejects(ada.c.action(api.commands.submit, { roomId, envelope: { version: "code-gods.player.v2", commandId: crypto.randomUUID(), command: { type: "pause" } } })), /Invalid command envelope/);
});

test("permissions: read/act/owner credentials are room-bound; spectators observe; chat is public, bounded and rate-limited", { timeout: 120000 }, async () => {
  const { trio: [host, ada, bo], roomId, shortCode, game, send } = await runningGame({ startingObjectCount: 2, startingEnergy: 60, maxAgentsPerGod: 1 });
  const [outsider] = await gods("Outside Olive");
  assert.match(await rejects(outsider.c.query(api.player.observation, { roomId })), /Join this room first/);
  const reader = await playerClient(ada, roomId, "read");
  assert.equal((await reader.query(api.player.observation, { roomId })).self.godId, ada.subject);
  assert.match(await rejects(reader.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "hi" }) })), /Read-only/);
  assert.match(await rejects(reader.mutation(api.activity.touch, {})), /Read-only/);
  const actor = await playerClient(ada, roomId, "act");
  assert.equal((await actor.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "From my player app" }) })).accepted, true);
  assert.match(await rejects(actor.mutation(api.rooms.create, {})), /Browser login/);
  assert.match(await rejects(actor.mutation(api.rooms.endActiveGame, { roomId })), /owner/i);
  const other = await gods("Other Room Owner", "Other Two", "Other Three");
  const elsewhere = await roomWith(other);
  const wrongRoom = await playerClient(ada, elsewhere.roomId, "act");
  assert.match(await rejects(wrongRoom.query(api.player.observation, { roomId })), /different room/);
  const notOwner = await playerClient(ada, roomId, "owner");
  assert.match(await rejects(notOwner.mutation(api.rooms.endActiveGame, { roomId })), /owner/i, "an owner grant still needs the current owner");
  const ownerApp = await playerClient(host, roomId, "owner");
  assert.equal((await ownerApp.query(api.rooms.get, { room: shortCode })).id, roomId);

  // Energy and the agent cap; spectators cannot act in the game.
  assert.equal((await send(ada, { type: "summon", language: "typescript", source: TS.Int })).accepted, true);
  assert.match((await send(ada, { type: "summon", language: "typescript", source: "function agent(x) { return [add(2)]; }" })).message, /1-agent resource limit|Insufficient energy/);
  assert.match((await send(bo, { type: "summon", language: "typescript", source: "function agent(x) { const k = x % 7 + 1; return k > 3 ? [add(k), add(1), add(2)] : [add(k)]; }" })).message, /Insufficient energy/);
  const [late] = await gods("Late Larry");
  await late.c.mutation(api.rooms.join, { room: shortCode });
  assert.match((await send(late, { type: "summon", language: "typescript", source: TS.Int })).message, /observing until the next game/);

  // Chat: public, ≤ 2,000 characters, one message a second per god.
  assert.match(await rejects(bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "x".repeat(2001) }) })), /Invalid command envelope/);
  assert.equal((await bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "first" }) })).accepted, true);
  assert.match((await bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "chat", text: "second" }) })).message, /rate limit/);
  const seen = await late.c.query(api.player.observation, { roomId });
  assert.ok(seen.chat.some((m: any) => m.text === "From my player app") && seen.chat.some((m: any) => m.text === "first"), "chat is public to every member");
  assert.match((await raw(game.gameId)).game.seasonCommitment, /^[0-9a-f]{64}$/);
});
