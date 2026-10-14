import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { uniformObject, lifetimeSeconds, poissonIntervalSeconds, assertObjectValue, uniquePrefixes } from "@workspace/game-core";
import type { Room, Actor, Game } from "./types";
import { allRooms, mutate, member, owner } from "./store";
import { requireAdapters } from "./adapters";
import { hash } from "../lib/identity";
import { logger } from "../lib/logger";

const openUniform = () => (randomBytes(6).readUIntBE(0, 6) + 0.5) / 281474976710656;
function below(bound: bigint): bigint {
  const bytes = Math.ceil(bound.toString(2).length / 8);
  const range = 1n << BigInt(bytes * 8), limit = range - range % bound;
  for (;;) {
    const n = BigInt(`0x${randomBytes(bytes).toString("hex")}`);
    if (n < limit) return n % bound;
  }
}
function valuate(game: Game, value: number | string) {
  const { values } = requireAdapters();
  return Object.fromEntries(game.deities.map(d => {
    const result = values.evaluate(d.descriptor, value);
    if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error("Invalid generated valuation");
    return [d.id, result];
  }));
}
function spawn(game: Game) {
  const value = uniformObject(game.settings, below);
  game.objects.push({ id: randomUUID(), value, version: 0, values: valuate(game, value) });
}
export async function startGame(room: Room, actor: Actor) {
  owner(room, actor);
  if (room.game && room.game.phase !== "ended") throw new Error("There is already a live game");
  if (room.members.length < 3) throw new Error("At least three gods are required");
  if (room.members.some(m => m.kind === "ai")) {
    throw Object.assign(new Error("AI controller integration is not yet available"), { status: 503 });
  }
  const { values } = requireAdapters();
  const descriptors = values.generate(room.settings, room.members.length, opaqueSeed());
  if (descriptors.length !== room.members.length) throw new Error("Generator roster mismatch");
  const id = randomUUID(), now = Date.now();
  const gameIds = (await pool.query("SELECT id FROM cg_games")).rows.map(row => row.id as string);
  // Game UUIDs are canonical; aliases are resolved against the full namespace.
  const aliases = uniquePrefixes([...gameIds, id]);
  const game: Game = {
    id, shortCode: aliases.find(a => a.id === id)!.shortCode, phase: "planning", settings: { ...room.settings },
    roster: structuredClone(room.members), deities: room.members.map((m, i) => ({
      id: m.id, ...descriptors[i], spent: 0, pauseUsed: false,
    })),
    objects: [], agents: [], createdAt: now, planningEndsAt: now + room.settings.planningSeconds * 1000,
    pauseEndsAt: 0, worldSeconds: 0, endAtWorld: lifetimeSeconds(room.settings.halfLifeSeconds, openUniform()),
    nextSpawn: poissonIntervalSeconds(room.settings.spawnRateHz, openUniform()),
    nextInteraction: poissonIntervalSeconds(room.settings.interactionRateHz, openUniform()),
    lastTick: now,
  };
  // Infinity cannot be round-tripped in JSON; disabled sources use a finite sentinel.
  if (!Number.isFinite(game.nextSpawn)) game.nextSpawn = Number.MAX_VALUE;
  if (!Number.isFinite(game.nextInteraction)) game.nextInteraction = Number.MAX_VALUE;
  for (let i = 0; i < game.settings.startingObjectCount; i++) spawn(game);
  room.game = game;
  room.members.forEach(m => { m.ready = false; });
}
const opaqueSeed = () => randomBytes(32).toString("hex");

export async function playerCommand(room: Room, actor: Actor, input: { command: string; requestId: string; gameId?: string; payload?: Record<string, unknown> }) {
  member(room, actor);
  if (!input.requestId || input.requestId.length > 100) throw new Error("Invalid request ID");
  const key = `${actor.id}:${input.gameId ?? "room"}:${input.requestId}`;
  const digest = hash(JSON.stringify(input));
  if (room.receipts[key]) {
    if (room.receipts[key].hash !== digest) throw new Error("Request ID reused with different payload");
    return room.receipts[key].result;
  }
  const game = room.game, payload = input.payload ?? {};
  let result: unknown;
  if (input.command === "chat.send") {
    const text = payload.text;
    if (typeof text !== "string" || !text.trim() || text.length > 4000) throw new Error("Chat text must be 1–4000 characters");
    const last = [...room.chat].reverse().find(m => m.authorId === actor.id);
    if (last && Date.now() - last.timestamp < 1000) throw Object.assign(new Error("Chat rate limit"), { status: 429 });
    const message = { id: randomUUID(), authorId: actor.id, authorName: room.members.find(m => m.id === actor.id)!.name, kind: actor.kind, text, timestamp: Date.now() };
    room.chat.push(message);
    result = message;
  } else if (input.command === "ready.set") {
    if (typeof payload.ready !== "boolean") throw new Error("Expected readiness boolean");
    room.members.find(m => m.id === actor.id)!.ready = payload.ready;
    result = { ready: payload.ready };
  } else {
    if (!game || input.gameId !== game.id) throw new Error("Stale game");
    if (game.phase === "ended" || game.phase === "recovery") throw new Error("Game is not accepting commands");
    const deity = game.deities.find(d => d.id === actor.id);
    if (!deity) throw new Error("You are observing until the next game");
    if (input.command === "pause.use") {
      if (game.phase !== "running" || deity.pauseUsed) throw new Error("Pause is unavailable");
      deity.pauseUsed = true;
      game.phase = "paused";
      game.pauseEndsAt = Date.now() + game.settings.pauseSeconds * 1000;
      result = { pauseEndsAt: game.pauseEndsAt };
    } else if (input.command === "agent.summon") {
      const source = payload.source;
      if (typeof source !== "string" || Buffer.byteLength(source) > 16384) throw new Error("Source exceeds 16384 bytes");
      const { runtime } = requireAdapters();
      const inspection = await runtime.inspect(source, game.settings);
      if (!Number.isSafeInteger(inspection.cost) || inspection.cost < 0) throw new Error("Invalid runtime cost");
      const samples = game.objects.slice(0, 3).map(o => o.value);
      if (!samples.length) samples.push(game.settings.objectType === "Int" ? game.settings.intMin : "");
      for (const value of samples) assertObjectValue(await runtime.execute(source, value, game.settings), game.settings);
      const available = game.settings.startingEnergy + (Date.now() - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent;
      if (available < inspection.cost) throw new Error("Insufficient energy");
      const agent = { id: randomUUID(), ownerId: actor.id, source, cost: inspection.cost, createdAt: Date.now() };
      deity.spent += inspection.cost;
      game.agents.push(agent);
      result = agent;
    } else throw new Error("Unknown command");
  }
  room.receipts[key] = { hash: digest, result };
  return result;
}

let ticking = false;
export function startTicker() {
  setInterval(() => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      for (const room of allRooms()) {
        if (!room.game || ["ended", "recovery"].includes(room.game.phase)) continue;
        await mutate(room.id, async draft => {
          const g = draft.game!, now = Date.now();
          if (g.phase === "planning" || g.phase === "paused") {
            const deadline = g.phase === "planning" ? g.planningEndsAt : g.pauseEndsAt;
            if (now < deadline) { g.lastTick = now; return; }
            g.phase = "running"; g.lastTick = deadline;
          }
          const elapsed = Math.max(0, now - g.lastTick) / 1000;
          g.lastTick = now;
          const target = g.worldSeconds + elapsed;
          let processed = 0;
          while (Math.min(g.nextSpawn, g.nextInteraction, g.endAtWorld) <= target) {
            if (++processed > 50) { g.phase = "recovery"; logger.warn({ roomId: draft.id }, "World paused due to execution backlog"); return; }
            const next = Math.min(g.nextSpawn, g.nextInteraction, g.endAtWorld);
            g.worldSeconds = next;
            if (next === g.endAtWorld) { g.phase = "ended"; return; }
            if (next === g.nextSpawn) {
              if (g.objects.length >= 10000) { g.phase = "recovery"; return; }
              spawn(g);
              g.nextSpawn += poissonIntervalSeconds(g.settings.spawnRateHz, openUniform());
            } else {
              g.nextInteraction += poissonIntervalSeconds(g.settings.interactionRateHz, openUniform());
              if (!g.objects.length || !g.agents.length) continue;
              const object = g.objects[Number(below(BigInt(g.objects.length)))];
              const agent = g.agents[Number(below(BigInt(g.agents.length)))];
              try {
                const value = await requireAdapters().runtime.execute(agent.source, object.value, g.settings);
                assertObjectValue(value, g.settings);
                object.value = value; object.version++; object.values = valuate(g, value);
              } catch { logger.info({ agentId: agent.id }, "Agent execution failed without changing the object"); }
            }
          }
          g.worldSeconds = target;
        });
      }
    })().catch(error => logger.error({ err: error }, "World tick failed")).finally(() => { ticking = false; });
  }, 100).unref();
}
