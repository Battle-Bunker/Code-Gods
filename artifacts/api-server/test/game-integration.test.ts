import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
// These exports exist ONLY in the runner's in-memory DB fixture.
// @ts-expect-error isolated test fixture
import { fixtureRooms, fixtureGames, fixtureAgents } from "@workspace/db";
// @ts-expect-error isolated test fixture
import { fixtureActors } from "../src/lib/identity";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import roomsRouter from "../src/routes/rooms";
import playerRouter from "../src/routes/player";
import { attachSockets } from "../src/game/socket";
import { createRoom, mutate, resolveRoom } from "../src/game/store";
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

test("three-player authority: exact costs, receipts, pause energy, privacy and persistent AI reservations", { timeout: 30000 }, async (t) => {
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
      // Keep transformations total over the full generated integer domain.
      g.agents.forEach(agent => { agent.source = "(x: number) => x"; });
    });
    const adapters = requireAdapters();
    let hold = false, held = 0, released = 0;
    const gate = new Promise<void>(resolve => { releaseExecutions = resolve; });
    registerAdapters({
      values: adapters.values,
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
    assert.equal(transformation.before, transformation.object.value, "identity runtime result is persisted faithfully");
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
