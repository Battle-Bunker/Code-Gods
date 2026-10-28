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
import { createRoom, mutate, mutateInteraction, interactionCapacity, resolveRoom, closeStore, rehydrateInteractions } from "../src/game/store";
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

test("bounded queued interactions preserve command durability and retry failed writes", async () => {
  const host: Actor = { id: randomUUID(), name: "Queue test", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  await mutate(room.id, async draft => {
    draft.game = { id: randomUUID(), shortCode: "fixture", phase: "ended", objects: [
      { id: "object", value: 0, version: 0, values: {} },
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
    id: "room", seq: 8, game: { id: "game", objects: [{ id: "object", value: 0, version: 0, values: {} }], events: [] },
  } as any;
  const events = Array.from({ length: 1000 }, (_, i) => ({
    id: `event-${i}`, gameId: "game", type: "object.transformed" as const, timestamp: i,
    before: i, object: { id: "object", value: i + 1, version: i + 1, values: { deity: 0.5 } },
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
      room.settings.grammarId = "typescript-standard-v1";
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
    const validate = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: "(x: number) => x" }));
    assert.deepEqual(validate.validation, { valid: true, cost: 6, diagnostics: [] });
    assert.equal(resolveRoom(id).game!.deities[0].spent, 0);
    const summon = envelope({ type: "summon", language: "typescript", source: "(x: number) => x + 1" });
    const receipt = await executePlayerEnvelope(id, host, summon);
    assert.equal(receipt.accepted, true);
    assert.equal(resolveRoom(id).game!.deities[0].spent, 9);
    assert.deepEqual(await executePlayerEnvelope(id, host, summon), receipt);
    assert.equal(resolveRoom(id).game!.agents.length, 1);
    await assert.rejects(executePlayerEnvelope(id, host, { ...summon, command: { ...summon.command, source: "(x: number) => x" } }), /reused/);
    const saved = fixtureRooms.get(id);
    assert.deepEqual(saved.receipts[`client:${host.id}:${summon.commandId}`].result, receipt);
    assert.equal(saved.game.deities[0].spent, 9);
    const invalid = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: "export default (x: number) => x" }));
    assert.equal(invalid.accepted, false);

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
    assert.ok(observation(room, host).self.energy >= 111, "energy accrues on wall clock even while paused");
    await executePlayerEnvelope(id, host, envelope({ type: "chat", text: "Public negotiation only" }));
    assert.equal(observation(resolveRoom(id), second).chat.at(-1)!.text, "Public negotiation only");
    const pub = JSON.stringify(publicRoom(resolveRoom(id)));
    assert.ok(!pub.includes("Negotiate honestly") && !pub.includes("Changed lobby metadata"));
    assert.ok(!pub.includes("descriptor") && !pub.includes("valueSource") && !pub.includes("(x: number)"));
    const other = observation(resolveRoom(id), second);
    assert.equal(other.agents.length, 0);
    assert.ok(!JSON.stringify(other).includes("(x: number) => x + 1"));
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
        return { text: '{"actions":[{"type":"summon","language":"typescript","source":"(x: number) => x"}]}', inputTokens: 100, outputTokens: 10 };
      } }, onEvent: () => {},
    });
    await controller.step();
    assert.equal(calls, 1);
    assert.equal(resolveRoom(id).game!.agents.filter(a => a.ownerId === bot.id).length, 1, "AI uses game-scoped validation and summon commands");
    assert.equal(resolveRoom(id).game!.deities.find(d => d.id === bot.id)!.spent, 6);
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
      const validated = await (await post(`/player/v1/rooms/${id}/commands`, envelope({ type: "validate", source: "(x: number) => x", language: "typescript" }), "player")).json();
      assert.equal(validated.validation.cost, 6);
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
      // Total over the integer domain, and never onto the object's own value (objects are unique).
      g.agents.forEach(agent => { agent.source = "(x: number) => x === 2147483647 ? x - 1 : x + 1"; });
    });
    const adapters = requireAdapters();
    let hold = false, held = 0, released = 0;
    const gate = new Promise<void>(resolve => { releaseExecutions = resolve; });
    registerAdapters({
      utilities: adapters.utilities,
      runtime: {
        ...adapters.runtime,
        async execute(source, value, settings) {
          const result = await adapters.runtime.execute(source, value, settings);
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
        runtime: { ...adapters.runtime, execute: async (_source, value) => value === 2147483647 ? value - 1 : (value as number) + 1 },
      });
      for (const count of [10, 100, 2000]) {
        await mutate(room.id, async draft => {
          draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
          draft.settings = { ...draft.settings, language: "typescript", grammarId: "typescript-standard-v1",
            startingObjectCount: count, spawnRateHz: 0, interactionRateHz: 1000 };
          await startGame(draft, host);
          const g = draft.game!;
          g.phase = "running"; g.lastTick = Date.now(); g.endAtWorld = 3600;
          // Explicit synthetic-only headroom bypass; production validation is unchanged.
          if (mode === "cheap-synthetic") g.settings.interactionRateHz = 4000;
          g.agents.push({ id: randomUUID(), ownerId: host.id, source: "(x: number) => x === 2147483647 ? x - 1 : x + 1", cost: 0, createdAt: Date.now() });
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

test("objects stay unique: spawns never duplicate and transformations onto an existing value fail", { timeout: 60000 }, async () => {
  await initializeRuntimeAdapters();
  const host: Actor = { id: randomUUID(), name: "Unique", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  const adapters = requireAdapters();
  // No utility family can be fully satisfied in a six-value domain, so deal fixed ones.
  registerAdapters({ ...adapters, utilities: { ...adapters.utilities,
    deal: (_settings, count) => Array.from({ length: count }, (_, d) => ({ familyId: "digit-devotee", params: { d } })) } });
  let stop: (() => Promise<void>) | undefined;
  try {
    await mutate(room.id, async draft => {
      draft.members = [host, { ...host, id: randomUUID() }, { ...host, id: randomUUID() }].map(m => ({ ...m, ready: true }));
      draft.settings = { ...draft.settings, language: "typescript", grammarId: "typescript-standard-v1",
        objectType: "Int", intMin: 0, intMax: 5, startingObjectCount: 6, spawnRateHz: 0 };
      await startGame(draft, host);
      const g = draft.game!;
      assert.deepEqual(g.objects.map(o => o.value).sort(), [0, 1, 2, 3, 4, 5], "a full tiny domain spawns every value exactly once");
      g.objects = g.objects.filter(o => (o.value as number) < 3);
      g.phase = "running"; g.lastTick = Date.now(); g.endAtWorld = 3600;
      g.agents.push({ id: randomUUID(), ownerId: host.id, source: "(x: number) => 5", cost: 0, createdAt: Date.now() });
    });
    await recordHumanActivity();
    stop = startTicker();
    const deadline = Date.now() + 20000;
    while (!resolveRoom(room.id).game!.events.some(e => e.type === "object.transformed")) {
      assert.ok(Date.now() < deadline, "a first constant transformation commits");
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Later attempts all collide with 5.
    await stop(); stop = undefined;
    const game = resolveRoom(room.id).game!;
    const values = game.objects.map(o => o.value);
    assert.equal(new Set(values).size, values.length);
    assert.equal(values.filter(v => v === 5).length, 1, "only the first constant transformation can succeed");
    assert.equal(game.events.filter(e => e.type === "object.transformed").length, 1);
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
    const firstSettings = { ...room.settings, language: "typescript", grammarId: "typescript-standard-v1", objectType: "Int", startingObjectCount: 4, spawnRateHz: 0 };
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
    for (const leak of ["utilities", "utility", "deities", "aiAgent", "endAtWorld", "source", "prompt"]) {
      assert.ok(!JSON.stringify(history).includes(`"${leak}"`), `history never discloses ${leak}`);
    }
    view = await json(get(`/games/${first.shortCode}/state`));
    assert.equal(view.status, "ended");
    assert.deepEqual(view.winners, record.winners);
    assert.ok(view.chat.some((m: any) => m.text === "Treaty proposal during game one"), "the game page shows chat sent during play");
    assert.ok(!JSON.stringify(view).includes('"utilities"'));

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
