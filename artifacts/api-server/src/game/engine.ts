import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { uniformObject, lifetimeSeconds, poissonIntervalSeconds, assertObjectValue, uniquePrefixes } from "@workspace/game-core";
import type { Room, Actor, Game, WorldEvent } from "./types";
import { allRooms, mutate, mutateInteraction, interactionCapacity, member, owner } from "./store";
import { requireAdapters } from "./adapters";
import { hash } from "../lib/identity";
import { logger } from "../lib/logger";
import { getAIProvider } from "./ai-provider";
import { isLocallyIdle } from "./activity";
import { advanceWorld, completionTarget, InteractionScheduler } from "./interaction-scheduler";

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
  const { utilities } = requireAdapters();
  return Object.fromEntries(game.deities.map(d => [d.id, utilities.evaluate(d.utility, value)]));
}
/** Every object in a world is unique: spawns redraw, and transformations onto an existing value fail. */
const occupied = (game: Game, value: number | string) => game.objects.some(o => o.value === value);
function spawn(game: Game) {
  let value = uniformObject(game.settings, below);
  for (let attempt = 0; occupied(game, value); attempt++) {
    if (attempt >= 100) return; // Only a nearly-full tiny domain can get here; skip this spawn.
    value = uniformObject(game.settings, below);
  }
  const object = { id: randomUUID(), value, version: 0, utilities: valuate(game, value) };
  game.objects.push(object);
  recordEvent(game, { id: randomUUID(), gameId: game.id, type: "object.spawned", object: structuredClone(object), timestamp: Date.now() });
}
function recordEvent(game: Game, event: WorldEvent) {
  game.events.push(event);
  if (game.events.length > 5000) game.events.splice(0, game.events.length - 5000);
}
export async function startGame(room: Room, actor: Actor) {
  owner(room, actor);
  if (room.game && room.game.phase !== "ended") throw new Error("There is already a live game");
  if (room.members.length < 3) throw new Error("At least three gods are required");
  if (room.members.length > 8) throw new Error("At most eight gods can play");
  if (room.members.some(m => m.kind === "ai")) {
    for (const bot of room.members.filter(m => m.kind === "ai")) {
      if (!bot.aiAgent) throw new Error("Replace legacy AI seats with an agent from the library");
      getAIProvider(bot.aiAgent);
    }
    if (room.aiBudget <= 0) throw new Error("Approve an AI token budget before starting with AI seats");
  }
  const { utilities, runtime } = requireAdapters();
  if (!runtime.languages.includes(room.settings.language)) throw new Error("The selected isolated runtime is unavailable");
  const dealt = utilities.deal(room.settings, room.members.length);
  const id = randomUUID(), now = Date.now();
  const gameIds = (await pool.query("SELECT id FROM cg_games")).rows.map(row => row.id as string);
  // Game UUIDs are canonical; aliases are resolved against the full namespace.
  const aliases = uniquePrefixes([...gameIds, id]);
  const game: Game = {
    id, shortCode: aliases.find(a => a.id === id)!.shortCode, phase: "planning", settings: { ...room.settings },
    roster: structuredClone(room.members), deities: room.members.map((m, i) => ({
      id: m.id, utility: dealt[i], spent: 0, pauseUsed: false,
    })),
    objects: [], agents: [], events: [], createdAt: now, planningEndsAt: now + room.settings.planningSeconds * 1000,
    pauseEndsAt: 0, worldSeconds: 0, endAtWorld: lifetimeSeconds(room.settings.halfLifeSeconds, openUniform()),
    nextSpawn: poissonIntervalSeconds(room.settings.spawnRateHz, openUniform()),
    nextInteraction: 0, // Legacy persisted field; interactions are now capacity-capped dispatches.
    lastTick: now,
  };
  // Infinity cannot be round-tripped in JSON; disabled sources use a finite sentinel.
  if (!Number.isFinite(game.nextSpawn)) game.nextSpawn = Number.MAX_VALUE;
  if (!Number.isFinite(game.nextInteraction)) game.nextInteraction = Number.MAX_VALUE;
  for (let i = 0; i < game.settings.startingObjectCount; i++) spawn(game);
  room.game = game;
  room.aiUsed = 0; room.aiReservedUsd = 0;
  room.members.forEach(m => { m.ready = false; });
}

/** The owner closes the active game early; its final state is recorded like any other ending. */
export function endGame(room: Room, actor: Actor) {
  owner(room, actor);
  const game = room.game;
  if (!game || game.phase === "ended") throw new Error("There is no active game to end");
  // Invalidates in-flight interactions: completions recheck phase and epoch.
  game.executionEpoch = (game.executionEpoch ?? 0) + 1;
  game.phase = "ended";
  game.endReason = "owner";
  delete game.autoResume;
}

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
    if (typeof text !== "string" || !text.trim() || text.length > 2000) throw new Error("Chat text must be 1–2000 characters");
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
      advanceWorld(game, Date.now(), spawn, () => poissonIntervalSeconds(game.settings.spawnRateHz, openUniform()));
      if (game.phase !== "running") throw new Error("Pause is unavailable");
      deity.pauseUsed = true;
      game.executionEpoch = (game.executionEpoch ?? 0) + 1;
      game.phase = "paused";
      game.pauseEndsAt = Date.now() + game.settings.pauseSeconds * 1000;
      result = { pauseEndsAt: game.pauseEndsAt };
    } else if (input.command === "agent.summon" || input.command === "agent.validate") {
      const source = payload.source;
      if (typeof source !== "string" || Buffer.byteLength(source) > 16384) throw new Error("Source exceeds 16384 bytes");
      const { runtime } = requireAdapters();
      const inspection = await runtime.inspect(source, game.settings);
      if (!Number.isSafeInteger(inspection.cost) || inspection.cost < 0) throw new Error("Invalid runtime cost");
      const samples = game.objects.slice(0, 3).map(o => o.value);
      if (!samples.length) samples.push(game.settings.objectType === "Int" ? game.settings.intMin : "");
      for (const value of samples) assertObjectValue(await runtime.execute(source, value, game.settings), game.settings);
      if (input.command === "agent.validate") {
        result = { valid: true, cost: inspection.cost, diagnostics: [] };
        room.receipts[key] = { hash: digest, result };
        return result;
      }
      const available = game.settings.startingEnergy + (Date.now() - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent;
      if (available < inspection.cost) throw new Error("Insufficient energy");
      if (game.agents.filter(a => a.ownerId === actor.id).length >= 200) throw new Error("This god has reached the 200-agent resource limit");
      const agent = { id: randomUUID(), ownerId: actor.id, source, cost: inspection.cost, createdAt: Date.now() };
      deity.spent += inspection.cost;
      game.agents.push(agent);
      result = agent;
    } else throw new Error("Unknown command");
  }
  room.receipts[key] = { hash: digest, result };
  return result;
}

/** World time is frozen in recovery, so resuming never skips simulated time. */
export function resumeGame(game: Game) {
  game.phase = game.worldSeconds === 0 && game.planningEndsAt > Date.now() ? "planning" : "running";
  game.lastTick = Date.now();
  delete game.recoveryReason;
  delete game.autoResume;
}

export function startTicker() {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const scheduler = new InteractionScheduler(
    () => performance.now(),
    () => {
      if (isLocallyIdle()) { scheduler.invalidate(); return []; }
      return allRooms().filter(r => r.game?.phase === "running").map(r => r.id);
    },
    (roomId, available) => {
      if (stopped || isLocallyIdle() || !interactionCapacity(roomId)) return;
      const room = allRooms().find(r => r.id === roomId), game = room?.game;
      if (!game || game.phase !== "running" || !game.agents.length || game.settings.interactionRateHz <= 0) return;
      // Do not admit work past the lifetime while waiting for the next persisted clock snapshot.
      if (game.worldSeconds + Math.max(0, Date.now() - game.lastTick) / 1000 >= game.endAtWorld) return;
      const objects = game.objects.filter(o => available(game.id, o.id));
      if (!objects.length) return;
      const object = objects[Number(below(BigInt(objects.length)))];
      const agent = game.agents[Number(below(BigInt(game.agents.length)))];
      // Copy every runtime input: cached rooms can be replaced during a serialized mutation.
      const snapshot = {
        gameId: game.id, objectId: object.id, version: object.version, before: object.value,
        source: agent.source, settings: structuredClone(game.settings), agentId: agent.id,
        ownerId: agent.ownerId, pauseEndsAt: game.pauseEndsAt, epoch: game.executionEpoch ?? 0,
      };
      return {
        roomId, gameId: game.id, objectId: object.id, rate: game.settings.interactionRateHz,
        execute: () => requireAdapters().runtime.execute(snapshot.source, snapshot.before, snapshot.settings),
        commit: async (result: unknown, current: () => boolean) => {
          if (!current() || stopped || isLocallyIdle()) return;
          await mutateInteraction(roomId, snapshot.objectId, draft => {
            const g = draft.game;
            if (!current() || stopped || isLocallyIdle() || !g) return false;
            const target = completionTarget(g, snapshot, Date.now());
            if (!target) return false;
            assertObjectValue(result, snapshot.settings);
            const value = result as number | string;
            if (occupied(g, value)) return false; // Includes identity: the object already holds this value.
            target.value = value; target.version++; target.utilities = valuate(g, value);
            recordEvent(g, { id: randomUUID(), gameId: g.id, type: "object.transformed", timestamp: Date.now(),
              object: structuredClone(target), agentId: snapshot.agentId, ownerId: snapshot.ownerId, before: snapshot.before });
            return true;
          });
        },
      };
    },
    error => logger.info({ errorName: error instanceof Error ? error.name : "Error" }, "Agent execution failed without changing the object"),
    () => wakeDispatch(),
    roomId => allRooms().find(r => r.id === roomId)?.game?.id,
  );
  let dispatchTimer: ReturnType<typeof setTimeout> | undefined;
  let dispatchImmediate: ReturnType<typeof setImmediate> | undefined;
  function wakeDispatch() {
    if (stopped || dispatchImmediate) return;
    if (dispatchTimer) { clearTimeout(dispatchTimer); dispatchTimer = undefined; }
    dispatchImmediate = setImmediate(() => {
      dispatchImmediate = undefined;
      scheduler.pump();
      const delay = scheduler.nextDelay();
      if (delay < 1) wakeDispatch();
      else dispatchTimer = setTimeout(() => { dispatchTimer = undefined; wakeDispatch(); }, delay).unref();
    });
  }
  wakeDispatch();
  const timer = setInterval(() => {
    if (pending || stopped) return;
    // Only one transition is persisted when idle; do not simulate unseen time.
    if (isLocallyIdle() && !allRooms().some(r => r.game && !["ended", "recovery"].includes(r.game.phase))) return;
    pending = (async () => {
      for (const room of allRooms()) {
        if (stopped) break;
        if (room.game?.phase === "recovery" && room.game.autoResume && !isLocallyIdle()) {
          await mutate(room.id, async draft => { if (draft.game?.phase === "recovery") resumeGame(draft.game); });
          continue;
        }
        if (!room.game || ["ended", "recovery"].includes(room.game.phase)) continue;
        const game = room.game, now = Date.now();
        const deadline = game.phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
        // Waiting phases need no clock writes. Running snapshots are persisted at least
        // once a second, or earlier for spawn/end deadlines, rather than empty 100ms writes.
        if (!isLocallyIdle() && (game.phase === "planning" || game.phase === "paused") && now < deadline) continue;
        const target = game.worldSeconds + Math.max(0, now - game.lastTick) / 1000;
        if (!isLocallyIdle() && game.phase === "running" && now - game.lastTick < 1000 &&
            target < Math.min(game.nextSpawn, game.endAtWorld)) continue;
        await mutate(room.id, async draft => {
          const g = draft.game, now = Date.now();
          if (stopped || !g || g.id !== game.id || ["ended", "recovery"].includes(g.phase)) return;
          if (isLocallyIdle()) {
            scheduler.invalidate();
            g.executionEpoch = (g.executionEpoch ?? 0) + 1;
            g.phase = "recovery";
            g.recoveryReason = "Server became idle. The game resumes when a player returns.";
            g.autoResume = true;
            return;
          }
          advanceWorld(g, now, spawn, () => poissonIntervalSeconds(g.settings.spawnRateHz, openUniform()));
          if (g.phase === "recovery") g.executionEpoch = (g.executionEpoch ?? 0) + 1;
        });
      }
      wakeDispatch();
    })().catch(error => logger.error({ errorName: error.name }, "World tick failed")).finally(() => { pending = undefined; });
  }, 100).unref();
  return async () => {
    stopped = true; clearInterval(timer);
    if (dispatchTimer) clearTimeout(dispatchTimer);
    if (dispatchImmediate) clearImmediate(dispatchImmediate);
    await Promise.all([pending, scheduler.stop()]);
  };
}
