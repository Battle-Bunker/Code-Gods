import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
// These exports exist ONLY in the runner's in-memory DB fixture.
// @ts-expect-error isolated test fixture
import { fixtureRooms, fixtureGames, fixtureAgents, fixtureControl, fixtureDurableRoom, fixtureDurableBatches, fixtureBatches, fixtureGameRows } from "@workspace/db";
// @ts-expect-error isolated test fixture
import { fixtureActors } from "../src/lib/identity";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import roomsRouter from "../src/routes/rooms";
import playerRouter from "../src/routes/player";
import gamesRouter from "../src/routes/games";
import { attachSockets } from "../src/game/socket";
import { createRoom, mutate, mutateInteraction, interactionCapacity, resolveRoom, closeStore, rehydrateInteractions, initializeStore } from "../src/game/store";
import { codecOf } from "@workspace/game-core";
import { startGame, playerCommand, startTicker } from "../src/game/engine";
import { recordHumanActivity } from "../src/game/activity";
import { registerAdapters, requireAdapters } from "../src/game/adapters";
import { observation, executePlayerEnvelope } from "../src/game/player-api";
import { publicRoom } from "../src/game/projection";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "../src/game/runtime-setup";
import { reserveAI } from "../src/game/ai-service";
import { AIController, SYSTEM } from "@workspace/ai-player";
import { VERSION } from "@workspace/player-client";
import type { Actor } from "../src/game/types";

const EMPTY_TS = "function agent(x) { return []; }";
const ADD_TS = "function agent(x) { return [add(1)]; }";
const ADD_PY = "def agent(x):\n    return [add(1)]";
/** A test agent that is always eligible (expected cost 1 bit, energy to spare). */
const richAgent = (ownerId: string, source: string, world = 0) => ({
  id: randomUUID(), ownerId, source, createdAt: Date.now(), summonCost: 0, expectedActCost: 1,
  account: { balance: 1000, settledWorldSeconds: world }, acts: 0, spent: 0,
});

test("bounded queued interactions preserve command durability and retry failed writes", async () => {
  const host: Actor = { id: randomUUID(), name: "Queue test", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  await mutate(room.id, async draft => {
    draft.game = { id: randomUUID(), shortCode: "fixture", phase: "ended", objects: [
      { id: "object", value: 0, version: 0, scores: {} },
    ], events: [], deities: [{ id: host.id, spent: 0 }] } as any;
  });
  const beforeInteractions = resolveRoom(room.id);
  const transform = () => mutateInteraction(room.id, "object", draft => {
    const g = draft.game!, object = g.objects[0];
    const before = object.value;
    object.version++; object.value = object.version;
    g.events.push({ id: randomUUID(), gameId: g.id, type: "object.transformed", timestamp: Date.now(), before, object: { ...object } });
    return true;
  });
  const writes = fixtureControl.interactionWrites;
  for (let i = 0; i < 64; i++) await transform();
  assert.equal(resolveRoom(room.id).game!.objects[0].version, 64);
  assert.equal(beforeInteractions.game!.objects[0].version, 0, "copy-on-write preserves prior snapshots");
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 0, "queued state is explicitly not yet durable");
  assert.equal(interactionCapacity(room.id), false);
  await transform();
  assert.equal(resolveRoom(room.id).game!.objects[0].version, 64, "saturation applies backpressure");
  fixtureControl.failCommit = true;
  await assert.rejects(mutate(room.id, async draft => { draft.receipts.spend = { hash: "hash", result: true }; }), /fixture commit failure/);
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 0, "failed transaction rolls back");
  assert.equal(resolveRoom(room.id).receipts.spend, undefined, "no command acknowledgement before durability");
  fixtureControl.failCommit = false;
  await mutate(room.id, async draft => {
    draft.game!.deities[0].spent = 9;
    draft.receipts.spend = { hash: "hash", result: true };
  });
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 64);
  assert.equal(fixtureRooms.get(room.id).game.events.length, 64);
  assert.equal(fixtureRooms.get(room.id).game.deities[0].spent, 9);
  assert.equal(fixtureRooms.get(room.id).receipts.spend.result, true);
  assert.equal(fixtureControl.interactionWrites - writes, 2, "one failed attempt plus one coalesced commit");
  assert.equal([...fixtureBatches.values()].filter((b: any) => b.room_id === room.id).length, 0, "checkpoint compacts covered batches");
  await transform();
  fixtureControl.loseAppendAck = true;
  await assert.rejects(mutate(room.id, async () => {}), /lost append acknowledgement/);
  assert.equal(interactionCapacity(room.id), false, "uncertain append freezes its exact idempotency key");
  await transform();
  assert.equal(resolveRoom(room.id).game!.objects[0].version, 65);
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 64);
  assert.equal(rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game!.objects[0].version, 65,
    "a committed append survives loss of its network acknowledgement");
  fixtureControl.failCheckpoint = true;
  await assert.rejects(mutate(room.id, async draft => {
    draft.receipts.failedSpend = { hash: "hash", result: true };
  }), /checkpoint failure/);
  assert.equal(resolveRoom(room.id).receipts.failedSpend, undefined);
  assert.equal([...fixtureBatches.values()].filter((b: any) => b.room_id === room.id).length, 1,
    "retry does not duplicate the batch; failed compaction retains it");
  assert.equal(rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game!.objects[0].version, 65);
  fixtureControl.failCheckpoint = false;
  await mutate(room.id, async () => {});
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 65);
  assert.equal([...fixtureBatches.values()].filter((b: any) => b.room_id === room.id).length, 0);
});

test("replay survives 1000 committed interactions, duplicate batches, partial checkpoints and rejects gaps", () => {
  const checkpoint = {
    id: "room", seq: 8, game: { id: "game", objects: [{ id: "object", value: 0, version: 0, scores: {} }], agents: [], events: [] },
  } as any;
  const events = Array.from({ length: 1000 }, (_, i) => ({
    id: `event-${i}`, gameId: "game", type: "object.transformed" as const, timestamp: i,
    before: i, object: { id: "object", value: i + 1, version: i + 1, scores: {} },
  }));
  const batches = Array.from({ length: 20 }, (_, i) => ({
    room_id: "room", game_id: "game", end_seq: 8 + (i + 1) * 50, events: events.slice(i * 50, (i + 1) * 50),
  }));
  const recovered = rehydrateInteractions(checkpoint, [...batches, batches[0]]);
  assert.equal(recovered.seq, 1008);
  assert.equal(recovered.game!.objects[0].version, 1000);
  assert.equal(recovered.game!.events.length, 1000);
  assert.equal(checkpoint.game.objects[0].version, 0);
  const partial = rehydrateInteractions(checkpoint, [{ ...batches[0], end_seq: 33, events: events.slice(0, 25) }]);
  assert.deepEqual(rehydrateInteractions(partial, batches), recovered);
  assert.deepEqual(rehydrateInteractions(recovered, batches), recovered);
  assert.throws(() => rehydrateInteractions(checkpoint, batches.slice(1)), /sequence gap/);
  assert.throws(() => rehydrateInteractions(checkpoint, [{ ...batches[0], events: batches[0].events.map((e, i) => i ? e : { ...e, before: -1 }) }]), /object transition/);
  assert.deepEqual(rehydrateInteractions(checkpoint, [{ ...batches[0], game_id: "old-game" }]), checkpoint);
});

test("three-player authority: exact costs, receipts, pause energy, privacy and persistent AI reservations", { timeout: 300000 }, async (t) => {
  const host: Actor = { id: randomUUID(), name: "Test Host", kind: "human", scope: "browser" };
  let stopTicker: (() => Promise<void>) | undefined;
  let releaseExecutions: (() => void) | undefined;
  try {
    await initializeRuntimeAdapters();
    await recordHumanActivity();
    const created = await createRoom(host), id = created.id;
    const second: Actor = { id: randomUUID(), name: "Second", kind: "human", scope: "browser" };
    const bot: Actor = { id: `ai:${randomUUID()}`, name: "Negotiator", kind: "ai", scope: "player", roomId: id };
    await mutate(id, async room => {
      room.settings.language = "typescript";
      room.settings.grammarId = "typescript-agent-v1";
      room.settings.objectType = "Int";
      room.settings.startingEnergy = 100;
      room.settings.energyPerSecond = 2;
      room.settings.startingObjectCount = 3;
      room.members.push({ ...second, ready: false }, { ...bot, ready: true,
        aiAgent: { id: randomUUID(), name: bot.name, provider: "openai", model: "gpt-4.1-mini", prompt: "Negotiate honestly.", revision: 1 } });
      room.aiBudget = 1_000_000;
      // Creating a provider performs no paid call; use a dummy server-only key.
      const prior = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-not-a-real-key";
      try { await startGame(room, host); }
      finally { if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior; }
    });
    let room = resolveRoom(id);
    assert.equal(room.game!.roster.length, 3);
    assert.equal(room.game!.objects.length, 3);
    assert.equal(fixtureGames.get(room.game!.id).roster[2].aiAgent.prompt, "Negotiate honestly.");
    await mutate(id, async draft => { draft.members[2].aiAgent!.prompt = "Changed lobby metadata"; });
    assert.equal(resolveRoom(id).game!.roster[2].aiAgent!.prompt, "Negotiate honestly.");

    const envelope = (command: any) => ({ version: VERSION, commandId: randomUUID(), gameId: resolveRoom(id).game!.id, command });
    const validate = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: EMPTY_TS }));
    assert.equal(validate.validation!.valid, true);
    assert.equal(validate.validation!.cost, 8, "ast-bytes-v1 price of function agent(x) { return []; }");
    assert.equal(validate.validation!.expectedActCost, 1, "an empty act fails and pays the 1-bit minimum");
    assert.match(validate.validation!.diagnostics[0], /would fail \(no change\)/);
    assert.equal(resolveRoom(id).game!.deities[0].spent, 0);
    const summon = envelope({ type: "summon", language: "typescript", source: ADD_TS });
    const receipt = await executePlayerEnvelope(id, host, summon);
    assert.equal(receipt.accepted, true, receipt.message);
    assert.equal(resolveRoom(id).game!.deities[0].spent, 11);
    assert.deepEqual(await executePlayerEnvelope(id, host, summon), receipt);
    assert.equal(resolveRoom(id).game!.agents.length, 1);
    const summoned = resolveRoom(id).game!.agents[0];
    assert.equal(summoned.summonCost, 11);
    assert.ok(summoned.expectedActCost > 1, "add(1) prices its decision and motion");
    assert.deepEqual([summoned.account.balance, summoned.acts, summoned.spent], [0, 0, 0], "a new agent starts with no energy");
    await assert.rejects(executePlayerEnvelope(id, host, { ...summon, command: { ...summon.command, source: EMPTY_TS } }), /reused/);
    const saved = fixtureRooms.get(id);
    assert.deepEqual(saved.receipts[`client:${host.id}:${summon.commandId}`].result, receipt);
    assert.equal(saved.game.deities[0].spent, 11);
    const invalid = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: "(x: number) => x" }));
    assert.equal(invalid.accepted, false, "a bare callable is not an agent: agent(x) must be declared");
    assert.equal(invalid.validation!.valid, false);

    await mutate(id, async draft => {
      draft.game!.phase = "running"; draft.game!.lastTick = Date.now() - 250;
      draft.game!.endAtWorld = 3600; // Keep this clock/pause assertion independent of sampled early game death.
      draft.game!.createdAt = Date.now() - 10000;
    });
    assert.equal((await executePlayerEnvelope(id, host, envelope({ type: "pause" }))).accepted, true);
    assert.equal((await executePlayerEnvelope(id, host, envelope({ type: "pause" }))).accepted, false);
    room = resolveRoom(id);
    assert.equal(room.game!.phase, "paused");
    assert.ok(room.game!.worldSeconds >= 0.25, "pausing accounts for elapsed running time before freezing");
    const pausedWorldSeconds = room.game!.worldSeconds;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(resolveRoom(id).game!.worldSeconds, pausedWorldSeconds, "paused world time stays frozen");
    assert.ok(observation(room, host).self.energy >= 109, "god energy accrues on wall clock even while paused");
    await executePlayerEnvelope(id, host, envelope({ type: "chat", text: "Public negotiation only" }));
    assert.equal(observation(resolveRoom(id), second).chat.at(-1)!.text, "Public negotiation only");
    const pub = JSON.stringify(publicRoom(resolveRoom(id)));
    assert.ok(!pub.includes("Negotiate honestly") && !pub.includes("Changed lobby metadata"));
    assert.ok(!pub.includes("descriptor") && !pub.includes("scores") && !pub.includes("return [add(1)]"));
    const other = observation(resolveRoom(id), second);
    assert.equal(other.agents.length, 0);
    assert.ok(!JSON.stringify(other).includes("return [add(1)]"));
    await assert.rejects(playerCommand(resolveRoom(id), host, { command: "chat.private", requestId: randomUUID(), gameId: room.game!.id }), /Unknown command/);

    let calls = 0;
    const controller = new AIController({
      roomId: id, godId: bot.id, customPrompt: room.game!.roster[2].aiAgent!.prompt,
      transport: { observe: async () => observation(resolveRoom(id), bot), send: async command => executePlayerEnvelope(id, bot, command) },
      budget: { reserve: (tokens, usd) => reserveAI(id, room.game!.id, tokens, usd) },
      provider: { estimateMaxUsd: () => 0.2, complete: async request => {
        calls++;
        assert.ok(request.system.startsWith(SYSTEM));
        assert.ok(request.system.endsWith("Negotiate honestly."));
        return { text: JSON.stringify({ actions: [{ type: "summon", language: "typescript", source: EMPTY_TS }] }), inputTokens: 100, outputTokens: 10 };
      } }, onEvent: () => {},
    });
    await controller.step();
    assert.equal(calls, 1);
    assert.equal(resolveRoom(id).game!.agents.filter(a => a.ownerId === bot.id).length, 1, "AI uses game-scoped validation and summon commands");
    assert.equal(resolveRoom(id).game!.deities.find(d => d.id === bot.id)!.spent, 8);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 0.2);
    assert.ok(fixtureRooms.get(id).aiUsed > 8192);
    await mutate(id, async draft => { draft.aiBudget = draft.aiUsed; });
    await assert.rejects(controller.step(), /budget/);
    assert.equal(calls, 1, "budget refusal must precede provider call");
    await mutate(id, async draft => { draft.aiBudget = 1_000_000; });
    const failure = new AIController({
      roomId: id, godId: bot.id,
      transport: { observe: async () => observation(resolveRoom(id), bot), send: async command => executePlayerEnvelope(id, bot, command) },
      budget: { reserve: (tokens, usd) => reserveAI(id, room.game!.id, tokens, usd) },
      provider: { estimateMaxUsd: () => 0.2, complete: async () => { throw new Error("Ambiguous provider failure"); } },
      onEvent: () => {},
    });
    await assert.rejects(failure.step(), /Ambiguous/);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 0.4, "failed calls retain persistent reservations");
    await assert.rejects(reserveAI(id, room.game!.id, 100, 1.81), /budget/);
    await reserveAI(id, room.game!.id, 100, 1.6);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 2);
    await assert.rejects(reserveAI(id, room.game!.id, 1, 0.001), /budget/);
    // Independent room contributes to the same host UTC-day ceiling.
    const otherRoom = await createRoom(second);
    await mutate(otherRoom.id, async draft => {
      draft.aiDaily = { day: new Date().toISOString().slice(0, 10), usd: 3, calls: [] };
    });
    await mutate(id, async draft => { draft.aiReservedUsd = 0; });
    await assert.rejects(reserveAI(id, room.game!.id, 1, 0.001), /budget/);
    // Exercise real HTTP routes and websocket projections with test-only sessions.
    fixtureActors.set("host", host);
    fixtureActors.set("player", { ...second, scope: "player", roomId: id });
    fixtureActors.set("other", { ...second, scope: "player", roomId: otherRoom.id });
    const app = express();
    app.use(express.json(), roomsRouter, playerRouter);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ error: error.message }));
    const server = createServer(app);
    attachSockets(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    let ws: WebSocket | undefined;
    try {
      const get = (path: string, token = "host") => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
      const post = (path: string, body: unknown, token = "host") => fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal((await get(`/rooms/${id}`)).status, 200);
      const projected = await (await get(`/player/v1/rooms/${id}/observation`, "player")).json();
      assert.equal(projected.self.godId, second.id);
      assert.equal(projected.agents.length, 0);
      assert.equal((await get(`/player/v1/rooms/${id}/observation`, "other")).status, 403);
      assert.equal((await get(`/rooms/${id}`, "missing")).status, 401);
      const validated = await (await post(`/player/v1/rooms/${id}/commands`, envelope({ type: "validate", source: EMPTY_TS, language: "typescript" }), "player")).json();
      assert.equal(validated.validation.cost, 8);
      assert.equal(validated.accepted, true);
      const noGame = await (await post(`/player/v1/rooms/${id}/commands`, { version: VERSION, commandId: randomUUID(), command: { type: "pause" } }, "player")).json();
      assert.equal(noGame.accepted, false);
      const definition = { id: "test-library", name: "Library agent", provider: "openai", model: "gpt-4.1-mini", prompt: "Private admin strategy", revision: 3, created_at: new Date(), updated_at: new Date() };
      fixtureAgents.set(definition.id, definition);
      const added = await post(`/rooms/${otherRoom.id}/actions`, { action: "addAi", requestId: randomUUID(), aiAgentId: definition.id }, "player");
      assert.equal(added.status, 403, "player tokens cannot edit seats");
      fixtureActors.set("second-browser", second);
      const selected = await post(`/rooms/${otherRoom.id}/actions`, { action: "addAi", requestId: randomUUID(), aiAgentId: definition.id }, "second-browser");
      assert.equal(selected.status, 200);
      const publicSeat = (await selected.json()).members.find((m: any) => m.kind === "ai");
      assert.equal(publicSeat.name, "Library agent");
      assert.equal(publicSeat.aiAgentId, definition.id);
      assert.equal(publicSeat.aiAgent, undefined);
      assert.equal(resolveRoom(otherRoom.id).members[1].aiAgent!.prompt, definition.prompt);
      definition.prompt = "Edited after selection";
      assert.equal(resolveRoom(otherRoom.id).members[1].aiAgent!.prompt, "Private admin strategy");
      ws = new WebSocket(`ws://127.0.0.1:${port}/api/rooms/${id}/ws`, { headers: { authorization: "Bearer player" } });
      const snapshot = once(ws, "message", { signal: t.signal }).then(([raw]) => JSON.parse(raw.toString()));
      const message = await snapshot;
      assert.equal(message.type, "room.snapshot");
      assert.ok(!JSON.stringify(message).includes("Negotiate honestly."));
      const command = envelope({ type: "ready", ready: true });
      const received = new Promise<any>((resolve, reject) => {
        const aborted = () => reject(new Error("Integration test deadline exceeded"));
        t.signal.addEventListener("abort", aborted, { once: true });
        ws!.on("message", raw => {
          const data = JSON.parse(raw.toString());
          if (data.type === "command.receipt") {
            t.signal.removeEventListener("abort", aborted);
            resolve(data);
          }
        });
        ws!.once("error", reject);
      });
      ws.send(JSON.stringify(command));
      const response = await received;
      assert.equal(response.payload.accepted, true);
    } finally {
      if (ws) { ws.terminate(); await once(ws, "close"); }
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    // Assemble the real ticker, serialized store and Wasm runtime against isolated SQL.
    const waitUntil = async (check: () => boolean, label: string) => {
      const deadline = Date.now() + 10000;
      while (!check()) {
        t.signal.throwIfAborted();
        if (Date.now() >= deadline) assert.fail(`Timed out: ${label}`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    await mutate(id, async draft => {
      const g = draft.game!;
      g.phase = "running"; g.lastTick = Date.now();
      g.endAtWorld = g.worldSeconds + 3600;
      g.nextSpawn = Number.MAX_VALUE;
      g.settings.interactionRateHz = 100;
      g.settings.pauseSeconds = 60;
      // add(1) wraps round the domain, so it is total; a rich, fast income keeps every agent eligible.
      g.settings.agentEnergyPerSecond = 1000; g.settings.agentBatteryActs = 1000;
      g.agents.forEach(agent => { agent.source = ADD_TS; agent.expectedActCost = 1; agent.account = { balance: 10, settledWorldSeconds: g.worldSeconds }; });
    });
    const adapters = requireAdapters();
    let hold = false, held = 0, released = 0;
    const gate = new Promise<void>(resolve => { releaseExecutions = resolve; });
    registerAdapters({
      utilities: adapters.utilities,
      runtime: {
        ...adapters.runtime,
        async act(source, value, settings) {
          const result = await adapters.runtime.act(source, value, settings);
          if (hold) { held++; await gate; released++; }
          return result;
        },
      },
    });
    await recordHumanActivity();
    stopTicker = startTicker();
    await waitUntil(() => fixtureGames.get(resolveRoom(id).game!.id).events.some((e: any) => e.type === "object.transformed"),
      "real ticker persists a Wasm transformation");
    const persisted = fixtureGames.get(resolveRoom(id).game!.id);
    const transformation = persisted.events.find((e: any) => e.type === "object.transformed");
    assert.ok(persisted.objects.find((o: any) => o.id === transformation.object.id).version >= 1);
    assert.equal(Math.abs(transformation.object.value - transformation.before), 1, "runtime result is persisted faithfully");
    assert.deepEqual(transformation.calls, [["add", { k: 1 }]]);
    assert.ok(transformation.cost.total > 0 && transformation.agent.acts >= 1, "the event carries the calls, the cost and the agent's account");
    hold = true;
    await waitUntil(() => held > 0, "runtime result deliberately held in flight");
    assert.equal((await executePlayerEnvelope(id, second, envelope({ type: "pause" }))).accepted, true);
    const paused = structuredClone(fixtureGames.get(resolveRoom(id).game!.id));
    releaseExecutions!();
    await waitUntil(() => released === held, "held runtime work drains");
    await new Promise(resolve => setTimeout(resolve, 200));
    const after = fixtureGames.get(paused.id);
    assert.equal(after.phase, "paused");
    assert.equal(after.worldSeconds, paused.worldSeconds, "ticker does not advance paused clock");
    assert.deepEqual(after.objects, paused.objects, "in-flight pre-pause completions cannot overwrite persisted objects");
    assert.equal(after.events.length, paused.events.length, "stale completions do not append transformation events");
    await stopTicker(); stopTicker = undefined;
    registerAdapters(adapters);
  } finally {
    releaseExecutions?.();
    await stopTicker?.();
    shutdownRuntimeAdapters();
  }
});

test("opt-in interaction pipeline benchmark: runtime, authority, events and fsynced fixture", {
  skip: process.env.RUN_INTERACTION_BENCHMARK !== "1", timeout: 30000,
}, async t => {
  await initializeRuntimeAdapters();
  const adapters = requireAdapters();
  const host: Actor = { id: randomUUID(), name: "Benchmark", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  let stop: (() => Promise<void>) | undefined;
  try {
    for (const mode of ["wasm", "cheap-synthetic"] as const) {
      registerAdapters(mode === "wasm" ? adapters : { ...adapters,
        runtime: { ...adapters.runtime, act: async () => ({ calls: '[["add",{"k":1}]]' }) },
      });
      for (const count of [10, 100, 2000]) {
        await mutate(room.id, async draft => {
          draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
          draft.settings = { ...draft.settings, language: "typescript", grammarId: "typescript-agent-v1",
            startingObjectCount: count, spawnRateHz: 0, interactionRateHz: 1000, agentEnergyPerSecond: 1000, agentBatteryActs: 1000 };
          await startGame(draft, host);
          const g = draft.game!;
          g.phase = "running"; g.lastTick = Date.now(); g.endAtWorld = 3600;
          // Explicit synthetic-only headroom bypass; production validation is unchanged.
          if (mode === "cheap-synthetic") g.settings.interactionRateHz = 4000;
          g.agents.push(richAgent(host.id, ADD_TS, g.worldSeconds));
        });
        await recordHumanActivity();
        const writes = fixtureControl.interactionWrites;
        const started = performance.now();
        stop = startTicker();
        await new Promise(resolve => setTimeout(resolve, 1000));
        await stop(); stop = undefined;
        await mutate(room.id, async draft => { draft.game!.phase = "ended"; });
        const elapsed = performance.now() - started;
        const persisted = fixtureDurableRoom(room.id);
        const countCommitted = persisted.game.objects.reduce((sum: number, object: any) => sum + object.version, 0);
        assert.equal(countCommitted, resolveRoom(room.id).game!.objects.reduce((sum, object) => sum + object.version, 0));
        assert.ok(countCommitted > 0);
        t.diagnostic(`${mode}: objects=${count}, durable transformations=${countCommitted}, elapsedMs=${elapsed.toFixed(1)}, transformations/sec=${(countCommitted * 1000 / elapsed).toFixed(1)}, incremental transactions=${fixtureControl.interactionWrites - writes}. Temporary fsync SQL fixture, NOT PostgreSQL.`);
      }
    }
  } finally {
    await stop?.();
    registerAdapters(adapters);
    shutdownRuntimeAdapters();
  }
});

test("objects stay unique: spawns never duplicate; duplicate results fail but still pay their decision bits", { timeout: 60000 }, async () => {
  await initializeRuntimeAdapters();
  const host: Actor = { id: randomUUID(), name: "Unique", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  const adapters = requireAdapters();
  // A six-value domain: deal fixed draws rather than rely on the lottery's distinctness there.
  registerAdapters({ ...adapters, utilities: { ...adapters.utilities,
    deal: (_settings, count) => Array.from({ length: count }, (_, d) => ({ familyId: "digit-devotee", params: { d } })) } });
  let stop: (() => Promise<void>) | undefined;
  try {
    await mutate(room.id, async draft => {
      draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
      draft.settings = { ...draft.settings, language: "typescript", grammarId: "typescript-agent-v1",
        objectType: "Int", typeArgs: { min: 0, max: 5 }, startingObjectCount: 6, spawnRateHz: 0,
        agentEnergyPerSecond: 1000, agentBatteryActs: 1000 };
      await startGame(draft, host);
      const g = draft.game!;
      assert.deepEqual(g.objects.map(o => o.value).sort(), [0, 1, 2, 3, 4, 5], "a full tiny domain spawns every value exactly once");
      g.objects = g.objects.filter(o => (o.value as number) < 3);
      g.phase = "running"; g.lastTick = Date.now(); g.endAtWorld = 3600;
      g.agents.push(richAgent(host.id, "function agent(x) { return [setTo(5)]; }", g.worldSeconds));
    });
    await recordHumanActivity();
    stop = startTicker();
    const deadline = Date.now() + 20000;
    while (resolveRoom(room.id).game!.events.filter(e => e.type === "agent.failed").length < 2) {
      assert.ok(Date.now() < deadline, "a first constant transformation commits, later ones collide");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await stop(); stop = undefined;
    const game = resolveRoom(room.id).game!;
    const values = game.objects.map(o => o.value);
    assert.equal(new Set(values).size, values.length);
    assert.equal(values.filter(v => v === 5).length, 1, "only the first constant transformation can succeed");
    assert.equal(game.events.filter(e => e.type === "object.transformed").length, 1);
    const failed = game.events.filter(e => e.type === "agent.failed");
    assert.ok(failed.every(e => e.type === "agent.failed" && /already has this value/.test(e.reason) && e.cost.erasure === 0 && e.cost.motion === 0 && e.cost.total === e.cost.decision));
    const agent = game.agents[0];
    assert.equal(agent.acts, game.events.filter(e => e.type !== "object.spawned").length, "every act is charged, successful or not");
    const transformed = game.events.find(e => e.type === "object.transformed")!;
    assert.ok(transformed.type === "object.transformed" && agent.spent > transformed.cost!.total, "duplicates paid as well");
  } finally {
    await stop?.();
    registerAdapters(adapters);
    shutdownRuntimeAdapters();
  }
});

test("games frozen by a restart or idling resume once a human is active; safety stops do not", { timeout: 60000 }, async () => {
  await initializeRuntimeAdapters();
  const host: Actor = { id: randomUUID(), name: "Resume", kind: "human", scope: "browser" };
  const rooms = [await createRoom(host), await createRoom(host)];
  let stop: (() => Promise<void>) | undefined;
  try {
    for (const [index, room] of rooms.entries()) {
      await mutate(room.id, async draft => {
        draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
        await startGame(draft, host);
        const g = draft.game!;
        g.phase = "recovery"; g.worldSeconds = 12; g.endAtWorld = 3600; g.lastTick = Date.now() - 60000;
        if (index === 0) g.autoResume = true;
      });
    }
    await recordHumanActivity();
    stop = startTicker();
    await new Promise(resolve => setTimeout(resolve, 500));
    const resumed = resolveRoom(rooms[0].id).game!;
    assert.equal(resumed.phase, "running");
    assert.ok(resumed.worldSeconds < 13, "downtime is not simulated");
    assert.equal(resolveRoom(rooms[1].id).game!.phase, "recovery", "only restart/idle recoveries resume themselves");
  } finally {
    await stop?.();
    shutdownRuntimeAdapters();
  }
});

test("room lobby lifecycle: launch, end, history recorded, second game launched in the same room", { timeout: 120000 }, async (t) => {
  await initializeRuntimeAdapters();
  await recordHumanActivity();
  const actors = ["Lobby Host", "Ada Seated", "Bo Seated", "Cy Latecomer"].map(name =>
    ({ id: randomUUID(), name, kind: "human" as const, scope: "browser" as const }));
  const [host, ada, bo, cy] = actors;
  for (const actor of actors) fixtureActors.set(`lobby:${actor.name}`, actor);
  const app = express();
  app.use(express.json(), roomsRouter, playerRouter, gamesRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ error: error.message }));
  const server = createServer(app);
  attachSockets(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const token = (actor: Actor) => `lobby:${actor.name}`;
  const get = (path: string, actor = host) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token(actor)}` } });
  const act = (id: string, body: Record<string, unknown>, actor = host) => fetch(`${base}/rooms/${id}/actions`, {
    method: "POST", headers: { authorization: `Bearer ${token(actor)}`, "content-type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), ...body }),
  });
  const json = async (response: Response | Promise<Response>) => {
    const r = await response;
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    return body;
  };
  const refused = async (response: Promise<Response>, pattern: RegExp) => {
    const r = await response;
    assert.notEqual(r.status, 200);
    assert.match((await r.json()).error, pattern);
  };
  let stop: (() => Promise<void>) | undefined;
  let ws: WebSocket | undefined;
  /** Shorten the sampled lifetime so the ticker ends this game naturally within a second. */
  const expireSoon = (id: string) => mutate(id, async draft => {
    const g = draft.game!;
    g.planningEndsAt = Date.now() - 1; g.endAtWorld = 0.2; g.nextSpawn = Number.MAX_VALUE;
  });
  const waitForEnd = async (id: string) => {
    const deadline = Date.now() + 20000;
    while (resolveRoom(id).game!.phase !== "ended") {
      assert.ok(Date.now() < deadline, "the ticker ends the game when its lifetime elapses");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  try {
    const { id } = await createRoom(host);
    await json(act(id, { action: "join" }, ada));
    await json(act(id, { action: "join" }, bo));
    let room = await json(get(`/rooms/${id}`));
    assert.equal(room.activeGame, null, "a new room is a lobby");
    assert.equal(room.ownerName, "Lobby Host");
    assert.equal(typeof room.createdAt, "number");
    const firstSettings = { ...room.settings, language: "typescript", grammarId: "typescript-agent-v1", objectType: "Int", startingObjectCount: 4, spawnRateHz: 0 };
    room = await json(act(id, { action: "settings", revision: room.revision, settings: firstSettings }));
    await refused(act(id, { action: "start" }, ada), /owner/);

    // Launch: the room points at its one active game, which has its own page.
    room = await json(act(id, { action: "start" }));
    const first = room.activeGame;
    assert.ok(first, "the launched game is the room's active game");
    assert.deepEqual(first.roster.map((m: any) => m.id).sort(), [host.id, ada.id, bo.id].sort());
    assert.equal(fixtureGameRows.get(first.id).summary, null, "no result is recorded while the game runs");
    let view = await json(get(`/games/${first.shortCode}/state`));
    assert.equal(view.status, "active");
    assert.equal(view.roomShortCode, room.shortCode);
    assert.equal(view.objects.length, 4);
    assert.deepEqual(view.winners, []);
    await refused(act(id, { action: "start" }), /already a live game/);
    await refused(act(id, { action: "settings", revision: room.revision, settings: firstSettings }), /frozen/);

    // A latecomer joins mid-game: a member who spectates and is dealt in next game.
    await json(act(id, { action: "join" }, cy));
    const spectator = await json(get(`/player/v1/rooms/${id}/observation`, cy));
    assert.equal(spectator.seated, false);
    assert.equal(spectator.gameShortCode, first.shortCode);
    assert.equal(spectator.self.utility, undefined);
    assert.deepEqual(spectator.objects, []);
    const seated = await json(get(`/player/v1/rooms/${id}/observation`, ada));
    assert.equal(seated.seated, true);
    await refused(act(id, { action: "leave" }, ada), /seated in the active game/);
    await refused(act(id, { action: "leave" }), /owner cannot leave/);
    const chat = await json(act(id, { action: "chat", text: "Treaty proposal during game one" }, bo));
    assert.ok(chat.chat.some((m: any) => m.text === "Treaty proposal during game one"));

    // End by lifetime: result recorded in the room's history; the room is a lobby again.
    stop = startTicker();
    await expireSoon(id);
    await waitForEnd(id);
    room = await json(get(`/rooms/${id}`));
    assert.equal(room.activeGame, null, "an ended game is no longer active");
    const listed = (await json(get(`/rooms`))).find((r: any) => r.id === id);
    assert.equal(listed.phase, "lobby");
    assert.equal(listed.activeGameShortCode, null);
    let history = await json(get(`/rooms/${id}/games`));
    assert.equal(history.length, 1);
    const [record] = history;
    assert.equal(record.id, first.id);
    assert.equal(record.shortCode, first.shortCode);
    assert.equal(record.endReason, "lifetime");
    assert.ok(record.endedAt >= record.startedAt);
    assert.equal(record.settings.startingObjectCount, 4, "history keeps the settings the game was played with");
    assert.equal(record.leaderboard.length, 3);
    assert.ok(record.winners.length >= 1 && record.winners.every((w: any) => record.leaderboard.some((s: any) => s.deityId === w.deityId && s.rank === 1)));
    assert.deepEqual(record.roster.map((m: any) => Object.keys(m).sort()), [0, 1, 2].map(() => ["id", "kind", "name"]));
    assert.equal(record.scoring, "information-v1");
    assert.ok(record.leaderboard.every((row: any) => typeof row.totalPayoff === "number"));
    for (const leak of ["scores", "netBits", "utility", "deities", "aiAgent", "endAtWorld", "source", "prompt"]) {
      assert.ok(!JSON.stringify(history).includes(`"${leak}"`), `history never discloses ${leak}`);
    }
    view = await json(get(`/games/${first.shortCode}/state`));
    assert.equal(view.status, "ended");
    assert.deepEqual(view.winners, record.winners);
    assert.ok(view.chat.some((m: any) => m.text === "Treaty proposal during game one"), "the game page shows chat sent during play");
    assert.ok(!JSON.stringify(view).includes('"scores"'));

    // Between games: members can leave/join, and the owner edits the next game's settings.
    await json(act(id, { action: "leave" }, cy));
    await json(act(id, { action: "join" }, cy));
    room = await json(get(`/rooms/${id}`));
    await json(act(id, { action: "settings", revision: room.revision, settings: { ...firstSettings, startingObjectCount: 2 } }));
    await json(act(id, { action: "chat", text: "Lobby talk after game one" }, cy));

    // Second game in the same room, with the same members plus the latecomer.
    room = await json(act(id, { action: "start" }));
    const second = room.activeGame;
    assert.notEqual(second.id, first.id);
    assert.equal(second.roster.length, 4, "the latecomer is dealt into the next game");
    assert.equal((await json(get(`/player/v1/rooms/${id}/observation`, cy))).seated, true);
    view = await json(get(`/games/${second.shortCode}/state`));
    assert.equal(view.objects.length, 2);
    assert.ok(!view.chat.some((m: any) => m.text === "Treaty proposal during game one"), "each game page shows only its own chat");
    const old = await json(get(`/games/${first.id}/state`));
    assert.equal(old.status, "ended", "a previous game stays viewable as its final state");
    assert.equal(old.settings.startingObjectCount, 4);
    assert.equal(old.roomActiveGame.id, second.id, "an old game's page can point to the room's newer game");
    assert.equal(old.objects.length, 4);

    // The owner ends the second game early; a socket hears it end.
    ws = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/api/rooms/${id}/ws`, { headers: { authorization: `Bearer ${token(ada)}` } });
    const ended = new Promise<any>((resolve, reject) => {
      ws!.on("message", raw => { const message = JSON.parse(raw.toString()); if (message.type === "game.ended") resolve(message.payload); });
      ws!.on("error", reject);
      t.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
    await once(ws, "open");
    await refused(act(id, { action: "endGame" }, ada), /owner/);
    await json(act(id, { action: "endGame" }));
    const endedEvent = await ended;
    assert.equal(endedEvent.id, second.id);
    assert.equal(endedEvent.endReason, "owner");
    history = await json(get(`/rooms/${id}/games`));
    assert.deepEqual(history.map((g: any) => g.id), [second.id, first.id], "history is newest first");
    assert.equal(history[0].settings.startingObjectCount, 2);
    assert.equal(history[0].roster.length, 4);
    await refused(act(id, { action: "endGame" }), /no active game/);
    assert.equal((await json(get(`/rooms/${id}`))).activeGame, null);
  } finally {
    ws?.close();
    await stop?.();
    server.close();
    shutdownRuntimeAdapters();
  }
});

const FULL_GAMES = [
  { objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, unoffered: { min: 0, max: 5 },
    agents: { python: ADD_PY, typescript: ADD_TS } },
  { objectType: "string", typeArgs: { maxLength: 128 }, unoffered: { maxLength: 3 },
    agents: { python: "def agent(s):\n    return [rotate(1)]", typescript: "function agent(s) { return [rotate(1)]; }" } },
  { objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, unoffered: { size: 7, symbols: "base16", colours: "rgb" },
    agents: { python: "def agent(grid):\n    return [slide(row(0), 1)]", typescript: "function agent(grid) { return [slide(row(0), 1)]; }" } },
] as const;
const BROKEN = { python: "def agent(x):\n    return [", typescript: "function agent(x) { return [; }" } as const;

for (const spec of FULL_GAMES) {
  test(`full ${spec.objectType} games through the real routes: scores, agents in both languages, energy, destroy, history`, { timeout: 300000 }, async t => {
    await initializeRuntimeAdapters();
    await recordHumanActivity();
    const actors = ["Host", "Ada", "Bo"].map(name => ({ id: randomUUID(), name: `${spec.objectType} ${name}`, kind: "human" as const, scope: "browser" as const }));
    const [host, ada, bo] = actors;
    for (const actor of actors) fixtureActors.set(`full:${actor.name}`, actor);
    const app = express();
    app.use(express.json(), roomsRouter, playerRouter, gamesRouter);
    app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ error: error.message }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const headers = (actor: Actor) => ({ authorization: `Bearer full:${actor.name}`, "content-type": "application/json" });
    const get = (path: string, actor = host) => fetch(`${base}${path}`, { headers: headers(actor) });
    const post = (path: string, body: unknown, actor = host) => fetch(`${base}${path}`, { method: "POST", headers: headers(actor), body: JSON.stringify(body) });
    const json = async (response: Response | Promise<Response>) => {
      const r = await response, body = await r.json();
      assert.equal(r.status, 200, JSON.stringify(body));
      return body;
    };
    const act = (id: string, body: Record<string, unknown>, actor = host) => json(post(`/rooms/${id}/actions`, { requestId: randomUUID(), ...body }, actor));
    const command = (id: string, gameId: string, cmd: Record<string, unknown>, actor = host) =>
      json(post(`/player/v1/rooms/${id}/commands`, { version: VERSION, commandId: randomUUID(), gameId, command: cmd }, actor));
    const waitUntil = async (check: () => Promise<boolean> | boolean, label: string, ms = 90000) => {
      const deadline = Date.now() + ms;
      while (!await check()) {
        t.signal.throwIfAborted();
        if (Date.now() >= deadline) assert.fail(`Timed out: ${label}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} vs ${b}`);
    let stop: (() => Promise<void>) | undefined;
    try {
      // The manifest lists the type, its parameters, classes and the offered (calibrated) instantiations.
      const manifest = await json(get("/manifest"));
      assert.equal(manifest.playerProtocol, VERSION);
      const typeInfo = manifest.objectTypes.find((x: any) => x.id === spec.objectType);
      assert.ok(typeInfo.params.length > 0 && Array.isArray(typeInfo.classes));
      const offered = typeInfo.offered.find((o: any) => JSON.stringify(o.args) === JSON.stringify(spec.typeArgs));
      assert.ok(offered, `${spec.objectType}${JSON.stringify(spec.typeArgs)} is offered`);
      assert.ok(typeInfo.offered.every((o: any) => typeof o.key === "string" && Array.isArray(o.badges)));

      const { id } = await createRoom(host);
      await act(id, { action: "join" }, ada);
      await act(id, { action: "join" }, bo);
      let room = await json(get(`/rooms/${id}`));
      assert.equal("game" in room, false, "the room carries no game: games have their own pages");
      if (!typeInfo.offered.some((o: any) => JSON.stringify(o.args) === JSON.stringify(spec.unoffered))) {
        const r = await post(`/rooms/${id}/actions`, { requestId: randomUUID(), action: "settings", revision: room.revision,
          settings: { ...room.settings, objectType: spec.objectType, typeArgs: spec.unoffered } });
        assert.equal(r.status, 400);
        assert.match((await r.json()).error, /not offered/);
      }

      for (const language of ["python", "typescript"] as const) {
        const other = language === "python" ? "typescript" : "python";
        const source = spec.agents[language];
        room = await json(get(`/rooms/${id}`));
        const settings = { ...room.settings, objectType: spec.objectType, typeArgs: spec.typeArgs, language, grammarId: `${language}-agent-v1`,
          startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, interactionComputeMs: 200, agentEnergyPerSecond: 100, agentBatteryActs: 2 };
        room = await act(id, { action: "settings", revision: room.revision, settings });
        assert.equal(room.objectInstance.key, offered.key);
        assert.ok(room.objectInstance.mutators.length > 0);
        assert.ok(room.utilityCatalog.length > 0 && room.utilityCatalog.every((f: any) =>
          typeof f.available === "boolean" && Array.isArray(f.badges) && (f.available || typeof f.locked.reason === "string")));
        room = await act(id, { action: "start" });
        const game = room.activeGame;

        // Public: values and salience only.
        let view = await json(get(`/games/${game.shortCode}/state`));
        assert.equal(view.objects.length, 5);
        const codec = codecOf(settings as any);
        assert.ok(view.objects.every((o: any) => codec.isValid(o.value) && typeof o.salience === "number"));
        assert.equal(view.objectInstance.key, offered.key);
        for (const leak of ["scores", "netBits", "rewardBits", "ordinal", "deities", "utility"]) assert.ok(!JSON.stringify(view).includes(`"${leak}"`), `public view hides ${leak}`);

        // Personal: own score, peer aggregates and the kid card, nothing per opponent.
        let obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.version, VERSION);
        assert.equal(obs.instance.key, offered.key);
        assert.ok(obs.instance.helpers.some((h: any) => h.group === "mutator"));
        assert.equal(obs.economy.agentEnergyPerSecond, 100);
        assert.ok(obs.self.utility.familyId && obs.self.utility.emoji && obs.self.utility.summary);
        assert.match(obs.self.utility.source, language === "python" ? /def utility\(/ : /function utility\(/);
        const g0 = resolveRoom(id).game!;
        assert.equal(obs.objects.length, 5);
        for (const o of obs.objects) {
          const stored = g0.objects.find(x => x.id === o.id)!;
          assert.deepEqual(Object.keys(o).sort(), ["id", "own", "payoff", "peerCare", "peerNetBits", "value"]);
          assert.equal(o.own.netBits, stored.scores[ada.id].netBits);
          assert.deepEqual(o.own.ordinal, stored.scores[ada.id].ordinal);
          near(o.peerNetBits, stored.scores[host.id].netBits + stored.scores[bo.id].netBits, "peerNetBits is the sum over the other gods");
          assert.equal(o.peerCare, Math.max(0, o.peerNetBits));
          near(o.payoff, o.peerCare === 0 ? 0 : o.own.netBits * o.peerCare, "payoff");
          near(view.objects.find((x: any) => x.id === o.id).salience, o.own.netBits + o.peerNetBits, "salience is Σ net bits");
        }
        assert.ok(!JSON.stringify(obs.objects).includes(bo.id) && !JSON.stringify(obs.objects).includes(host.id), "no per-opponent scores");

        // Validation: price, sample acts and the expected cost per act. Free.
        const validation = await command(id, game.id, { type: "validate", language, source }, ada);
        assert.equal(validation.accepted, true, validation.message);
        assert.ok(validation.validation.valid && Number.isSafeInteger(validation.validation.cost) && validation.validation.cost > 0);
        assert.ok(validation.validation.expectedActCost > 0);
        assert.ok(validation.validation.diagnostics.some((d: string) => /mutator call/.test(d)), validation.validation.diagnostics.join(" | "));
        const broken = await command(id, game.id, { type: "validate", language, source: BROKEN[language] }, ada);
        assert.equal(broken.accepted, false);
        assert.equal(broken.validation.valid, false);
        assert.equal((await command(id, game.id, { type: "validate", language: other, source: spec.agents[other] }, ada)).accepted, false);

        // Summon: the god pays the description bits; the agent starts with no energy.
        const before = (await json(get(`/player/v1/rooms/${id}/observation`, ada))).self.energy;
        assert.equal((await command(id, game.id, { type: "summon", language, source }, ada)).accepted, true);
        assert.equal((await command(id, game.id, { type: "summon", language, source }, bo)).accepted, true);
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.agents.length, 1, "own agents only");
        const [mine] = obs.agents;
        assert.equal(mine.summonCost, validation.validation.cost);
        near(mine.expectedActCost, validation.validation.expectedActCost, "the expected act cost is deterministic per source");
        assert.deepEqual([mine.energy, mine.eligible, mine.acts, mine.spent], [0, false, 0, 0]);
        assert.ok(obs.self.energy <= before - mine.summonCost + 1, "summoning is paid from god energy");
        const bos = (await json(get(`/player/v1/rooms/${id}/observation`, bo))).agents;
        near(bos[0].expectedActCost, mine.expectedActCost, "same source, same expected cost");

        // Play: agents become eligible from world-time income, act and pay.
        await mutate(id, async draft => { draft.game!.planningEndsAt = Date.now() - 1; draft.game!.endAtWorld = 3600; });
        stop = startTicker();
        await waitUntil(async () => (await json(get(`/player/v1/rooms/${id}/observation`, ada))).transformations.length >= 2, "Ada's agent transforms objects");
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        const mutatorIds = obs.instance.mutators.map((m: any) => m.id);
        for (const tr of obs.transformations) {
          assert.ok(tr.calls.length >= 1 && tr.calls.every((c: any) => mutatorIds.includes(c[0])) && tr.cost > 0);
          assert.notEqual(tr.before, tr.after);
        }
        const acted = obs.agents[0];
        assert.ok(acted.acts >= 2 && acted.spent > 0, "acts are charged to the agent's own account");
        assert.equal(acted.eligible, acted.energy >= acted.expectedActCost);
        await stop(); stop = undefined;

        // Durability: replaying the committed batches over the checkpoint restores every agent account.
        await waitUntil(() => interactionCapacity(id) && fixtureControl.interactionWrites > 0, "batches flushed", 5000);
        await new Promise(resolve => setTimeout(resolve, 300));
        const agentState = (r: any) => r.game.agents.map((a: any) => [a.id, a.acts, a.spent, a.account]);
        assert.deepEqual(agentState(rehydrateInteractions(fixtureDurableRoom(id), fixtureDurableBatches())), agentState(resolveRoom(id)));

        // Destroy: owner only, free.
        assert.equal((await command(id, game.id, { type: "destroy", agentId: acted.id }, bo)).accepted, false);
        const energyBefore = obs.self.energy;
        assert.equal((await command(id, game.id, { type: "destroy", agentId: acted.id }, ada)).accepted, true);
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.agents.length, 0);
        assert.ok(obs.self.energy >= energyBefore, "destroying costs nothing");
        assert.equal(resolveRoom(id).game!.agents.length, 1, "Bo's agent lives on");

        // End: the public result joins the room's history.
        await act(id, { action: "endGame" });
        const history = await json(get(`/rooms/${id}/games`));
        const record = history.find((h: any) => h.id === game.id);
        assert.equal(record.scoring, "information-v1");
        assert.equal(record.endReason, "owner");
        assert.equal(record.leaderboard.length, 3);
        assert.ok(record.leaderboard.every((row: any) => typeof row.totalPayoff === "number" && row.rank >= 1));
        view = await json(get(`/games/${game.shortCode}/state`));
        assert.equal(view.status, "ended");
        for (const leak of ["scores", "netBits", "source", "deities", "account"]) {
          assert.ok(!JSON.stringify(history).includes(`"${leak}"`) && !JSON.stringify(view).includes(`"${leak}"`), `history hides ${leak}`);
        }
      }
      assert.equal((await json(get(`/rooms/${id}/games`))).length, 2, "one game per language");
    } finally {
      await stop?.();
      server.close();
      shutdownRuntimeAdapters();
    }
  });
}

test("replay restores agent accounts from failed and successful acts, and fails closed on unknown agents", () => {
  const account = (balance: number, world: number) => ({ balance, settledWorldSeconds: world });
  const agent = { ...richAgent("god", ADD_TS), id: "agent", account: account(0, 0) };
  const checkpoint = { id: "room", seq: 3, game: { id: "game", objects: [{ id: "object", value: 0, version: 0, scores: {} }], agents: [agent], events: [] } } as any;
  const cost = (total: number) => ({ decision: total, erasure: 0, motion: 0, total });
  const events = [
    { id: "e1", gameId: "game", type: "agent.failed", timestamp: 1, objectId: "object", agentId: "agent", ownerId: "god", reason: "no change",
      cost: cost(1), agent: { id: "agent", account: account(4, 2), acts: 1, spent: 1 } },
    { id: "e2", gameId: "game", type: "object.transformed", timestamp: 2, before: 0, agentId: "agent", ownerId: "god",
      object: { id: "object", value: 1, version: 1, scores: {} }, calls: [["add", { k: 1 }]], cost: cost(5),
      agent: { id: "agent", account: account(-1, 3), acts: 2, spent: 6 } },
  ];
  const recovered = rehydrateInteractions(checkpoint, [{ room_id: "room", game_id: "game", end_seq: 5, events: events as any }]);
  assert.equal(recovered.seq, 5);
  assert.equal(recovered.game!.objects[0].value, 1);
  assert.deepEqual(recovered.game!.agents[0].account, account(-1, 3), "a negative balance (cooldown) survives replay");
  assert.deepEqual([recovered.game!.agents[0].acts, recovered.game!.agents[0].spent], [2, 6]);
  assert.equal(checkpoint.game.agents[0].acts, 0, "the checkpoint itself is not mutated");
  assert.throws(() => rehydrateInteractions(checkpoint, [{ room_id: "room", game_id: "game", end_seq: 4,
    events: [{ ...events[0], agent: { ...events[0].agent, id: "ghost" } }] as any }]), /agent/);
});

test("startup guard: a stored room of the old design is reset; its games leave history", { timeout: 60000 }, async () => {
  const host: Actor = { id: randomUUID(), name: "Old Host", kind: "human", scope: "browser" };
  fixtureActors.set("old:host", host);
  const roomId = randomUUID(), oldGameId = randomUUID();
  const oldGame = { id: oldGameId, shortCode: "OLD", phase: "running", settings: { language: "python", objectType: "Int", intMin: 0, intMax: 9,
    grammarId: "python-standard-v1" }, roster: [], deities: [], objects: [{ id: "o", value: 3, version: 0, utilities: { [host.id]: 0.5 } }],
    agents: [{ id: "a", ownerId: host.id, source: "lambda x: x", cost: 6, createdAt: 1 }], events: [], createdAt: 1 };
  fixtureRooms.set(roomId, { id: roomId, shortCode: "OLDR", ownerId: host.id, createdAt: 5, revision: 3, seq: 7,
    settings: oldGame.settings, members: [{ id: host.id, name: host.name, kind: "human", ready: true }],
    chat: [{ id: "c", authorId: host.id, authorName: host.name, kind: "human", text: "kept", timestamp: 1 }],
    game: oldGame, aiBudget: 0, aiUsed: 0, receipts: {} });
  fixtureGames.set(oldGameId, oldGame);
  fixtureGameRows.set(oldGameId, { id: oldGameId, room_id: roomId, prefix_length: 3, started_at: 1, ended_at: 2,
    summary: { id: oldGameId, leaderboard: [{ deityId: host.id, totalScore: 1, rank: 1 }] } });
  fixtureBatches.set(`${roomId}:9`, { room_id: roomId, game_id: oldGameId, end_seq: 9, events: [{ type: "object.transformed" }] });
  await initializeStore();
  const reset = resolveRoom(roomId);
  assert.equal(reset.game, null);
  assert.deepEqual(reset.members.map(m => m.id), [host.id]);
  assert.deepEqual(reset.chat.map(m => m.text), ["kept"]);
  assert.equal(reset.settings.grammarId, "python-agent-v1");
  assert.ok(reset.seq > 9, "the reset checkpoint covers (and deletes) the old batches");
  assert.equal([...fixtureBatches.values()].filter((b: any) => b.room_id === roomId).length, 0);
  assert.equal(fixtureRooms.get(roomId).game, null);
  const app = express();
  app.use(express.json(), roomsRouter, gamesRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ error: error.message }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const get = (path: string) => fetch(`${base}${path}`, { headers: { authorization: "Bearer old:host" } });
    assert.deepEqual(await (await get(`/rooms/${roomId}/games`)).json(), [], "old-design games are not history");
    assert.equal((await get(`/games/${oldGameId}/state`)).status, 404);
    const room = await (await get(`/rooms/${roomId}`)).json();
    assert.equal(room.objectInstance.key, "Int(-2147483648,2147483647)");
  } finally { server.close(); }
});

test("graceful store shutdown flushes the bounded interaction window to disk", async () => {
  const host: Actor = { id: randomUUID(), name: "Shutdown", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  await mutate(room.id, async draft => {
    draft.game = { id: randomUUID(), shortCode: "shutdown", phase: "ended",
      objects: [{ id: "object", value: 0, version: 0, utilities: {} }], events: [] } as any;
  });
  await mutateInteraction(room.id, "object", draft => {
    const g = draft.game!, object = g.objects[0];
    object.version++;
    g.events.push({ id: randomUUID(), gameId: g.id, type: "object.transformed", timestamp: Date.now(), before: object.value, object: { ...object } });
    return true;
  });
  assert.equal(fixtureDurableRoom(room.id).game.objects[0].version, 0);
  await closeStore();
  assert.equal(fixtureDurableRoom(room.id).game.objects[0].version, 0, "shutdown need not rewrite checkpoints");
  assert.equal(rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game!.objects[0].version, 1,
    "committed log reconstructs the latest state after abrupt process loss");
  assert.equal(interactionCapacity(room.id), false);
  await assert.rejects(mutate(room.id, async () => {}), /shutting down/);
});
