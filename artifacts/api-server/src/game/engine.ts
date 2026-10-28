import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  chargeAct, instantiationOf, lifetimeSeconds, newAgentAccount, poissonIntervalSeconds,
  uniquePrefixes, validateSettings, type GameSettings, type ObjectValue,
} from "@workspace/game-core";
import {
  applyCalls, MIN_FAILED_ACT_BITS, objectType, seededRng, type ActCost, type ActOutcome, type MutatorCallWire,
} from "@workspace/game-types";
import type { Room, Actor, Game, WorldEvent, WorldObject, Agent, AgentActState } from "./types";
import { allRooms, mutate, mutateInteraction, interactionCapacity, member, owner } from "./store";
import { cryptoRng, isAgentFault, requireAdapters } from "./adapters";
import { hash, requireAct } from "../lib/identity";
import { logger } from "../lib/logger";
import { getAIProvider } from "./ai-provider";
import { isLocallyIdle } from "./activity";
import { advanceWorld, completionTarget, InteractionScheduler } from "./interaction-scheduler";
import { agentStatus, godEnergy, settledAccount, worldNow } from "./economy";

const openUniform = () => (randomBytes(6).readUIntBE(0, 6) + 0.5) / 281474976710656;
const below = (bound: number) => cryptoRng.int(bound);

// ------------------------------------------------------------------------------------------------
// objects
// ------------------------------------------------------------------------------------------------

/** Every god's private score of a value. */
function scoresOf(game: Game, value: ObjectValue): WorldObject["scores"] {
  const { utilities } = requireAdapters();
  return Object.fromEntries(game.deities.map(d => [d.id, utilities.score(game.settings, d.utility, value)]));
}
/** Every object in a world is unique: spawns redraw, and transformations onto an existing value fail. */
const occupied = (game: Game, value: ObjectValue) => game.objects.some(o => o.value === value);
function spawnValue(settings: GameSettings): ObjectValue {
  const inst = instantiationOf(settings), T = objectType(inst.objectType);
  return T.codec(inst).encode(T.spawn(inst, cryptoRng));
}
function spawn(game: Game) {
  let value = spawnValue(game.settings);
  for (let attempt = 0; occupied(game, value); attempt++) {
    if (attempt >= 100) return; // Only a nearly-full tiny domain can get here; skip this spawn.
    value = spawnValue(game.settings);
  }
  const object: WorldObject = { id: randomUUID(), value, version: 0, scores: scoresOf(game, value) };
  game.objects.push(object);
  recordEvent(game, { id: randomUUID(), gameId: game.id, type: "object.spawned", object: structuredClone(object), timestamp: Date.now() });
}
function recordEvent(game: Game, event: WorldEvent) {
  game.events.push(event);
  if (game.events.length > 5000) game.events.splice(0, game.events.length - 5000);
}

// ------------------------------------------------------------------------------------------------
// agent validation: description bits, sample acts and the expected cost per act
// ------------------------------------------------------------------------------------------------

/** Reference spawns for the expected act cost: fixed per instantiation, so the measure is deterministic per source. */
export const REFERENCE_SPAWNS = 16;
const referenceCache = new Map<string, ObjectValue[]>();
export function referenceSpawns(settings: GameSettings): ObjectValue[] {
  const inst = instantiationOf(settings);
  let values = referenceCache.get(inst.key);
  if (!values) {
    const T = objectType(inst.objectType), codec = T.codec(inst), rng = seededRng(`code-gods:reference-spawns:${inst.key}`);
    values = Array.from({ length: REFERENCE_SPAWNS }, () => codec.encode(T.spawn(inst, rng)));
    if (referenceCache.size >= 64) referenceCache.delete(referenceCache.keys().next().value!);
    referenceCache.set(inst.key, values);
  }
  return values;
}

/** The outcome of one act on `before`: applyCalls, or the failed-act minimum when the runtime refused it. */
export function actOutcome(settings: GameSettings, before: ObjectValue, result: { calls: string } | { error: string }): ActOutcome {
  if ("error" in result) {
    const cost: ActCost = { decision: MIN_FAILED_ACT_BITS, erasure: 0, motion: 0, total: MIN_FAILED_ACT_BITS };
    return { ok: false, reason: result.error, cost };
  }
  const inst = instantiationOf(settings);
  return applyCalls(objectType(inst.objectType), inst, before, result.calls);
}

export type Examination = { cost: number; expectedActCost: number; diagnostics: string[] };
const describeOutcome = (label: string, outcome: ActOutcome) => outcome.ok
  ? `${label}: ${outcome.calls.length} mutator call${outcome.calls.length === 1 ? "" : "s"} (${outcome.calls.map(c => c[0]).join(", ")}), ${outcome.cost.total.toFixed(2)} bits`
  : `${label}: the act would fail (${outcome.reason}) and still cost ${outcome.cost.total.toFixed(2)} bits`;

/**
 * Validate an agent: ast-bytes-v1 price (description bits), sample acts on the live objects, and the mean
 * act cost over the REFERENCE_SPAWNS fixed spawns. Throws (with the runtime's message) on the agent's own errors.
 */
export async function examineAgent(settings: GameSettings, source: string, live: ObjectValue[]): Promise<Examination> {
  const { runtime } = requireAdapters();
  const references = referenceSpawns(settings);
  // Measurement measures bits, not speed: a cold worker must not turn a fine agent into a failing one.
  const measuring = { ...settings, interactionComputeMs: Math.min(1000, Math.max(settings.interactionComputeMs, 50)) };
  let validated: { cost: number; outputs: string[] };
  try { validated = await runtime.validate(source, [...references, ...live], measuring); }
  catch (error) {
    if (!isAgentFault(error)) throw error;
    throw Object.assign(new Error((error as Error).message.slice(0, 1000)), { agentFault: true });
  }
  if (!Number.isSafeInteger(validated.cost) || validated.cost < 0) throw new Error("Invalid runtime cost");
  const costs = references.map((value, i) => actOutcome(settings, value, { calls: validated.outputs[i] }).cost.total);
  const expectedActCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const diagnostics = (live.length ? live : references.slice(0, 1)).map((value, i) =>
    describeOutcome(live.length ? `On object ${i + 1}` : "On a sample object",
      actOutcome(settings, value, { calls: validated.outputs[live.length ? references.length + i : 0] })));
  diagnostics.push(`Expected cost per act ${expectedActCost.toFixed(2)} bits (mean over ${REFERENCE_SPAWNS} reference objects); summon price ${validated.cost} bits.`);
  return { cost: validated.cost, expectedActCost, diagnostics };
}

// ------------------------------------------------------------------------------------------------
// lifecycle and commands
// ------------------------------------------------------------------------------------------------

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
  validateSettings(room.settings);
  const { utilities, runtime } = requireAdapters();
  if (!runtime.languages.includes(room.settings.language)) throw new Error("The selected isolated runtime is unavailable");
  const dealt = utilities.deal(room.settings, room.members.length);
  const id = randomUUID(), now = Date.now();
  const gameIds = (await pool.query("SELECT id FROM cg_games")).rows.map(row => row.id as string);
  // Game UUIDs are canonical; aliases are resolved against the full namespace.
  const aliases = uniquePrefixes([...gameIds, id]);
  const game: Game = {
    id, shortCode: aliases.find(a => a.id === id)!.shortCode, phase: "planning", scoring: "information-v1",
    settings: structuredClone(room.settings),
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
  room.aiInputTokens = 0; room.aiOutputTokens = 0;
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
  requireAct(actor);
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
      if (typeof source !== "string" || !source || Buffer.byteLength(source) > 16384) throw new Error("Source must be 1–16384 bytes");
      const examined = await examineAgent(game.settings, source, game.objects.slice(0, 3).map(o => o.value));
      if (input.command === "agent.validate") {
        result = { valid: true, cost: examined.cost, expectedActCost: examined.expectedActCost, diagnostics: examined.diagnostics };
        room.receipts[key] = { hash: digest, result };
        return result;
      }
      if (godEnergy(game, deity) < examined.cost) throw new Error("Insufficient energy");
      if (game.agents.filter(a => a.ownerId === actor.id).length >= game.settings.maxAgentsPerGod)
        throw new Error(`This god has reached the ${game.settings.maxAgentsPerGod}-agent resource limit`);
      const agent: Agent = {
        id: randomUUID(), ownerId: actor.id, source, createdAt: Date.now(),
        summonCost: examined.cost, expectedActCost: examined.expectedActCost,
        account: newAgentAccount(worldNow(game)), acts: 0, spent: 0,
      };
      deity.spent += examined.cost;
      game.agents.push(agent);
      result = { id: agent.id, summonCost: agent.summonCost, expectedActCost: agent.expectedActCost };
    } else if (input.command === "agent.destroy") {
      // Gods may destroy their own agents at any time, for free. Energy already spent is not refunded.
      const index = game.agents.findIndex(a => a.id === payload.agentId && a.ownerId === actor.id);
      if (index < 0) throw new Error("You have no agent with that ID");
      const [agent] = game.agents.splice(index, 1);
      result = { destroyed: agent.id };
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

// ------------------------------------------------------------------------------------------------
// interactions
// ------------------------------------------------------------------------------------------------

type ActSnapshot = {
  gameId: string; objectId: string; version: number; before: ObjectValue; agentId: string; ownerId: string;
  pauseEndsAt: number; epoch: number;
};
export type ActResult = { calls: string } | { error: string };

/**
 * Commit one act inside the mutation lock. The agent pays the act's actual cost whatever happens (a
 * failed or duplicate act pays its decision bits only); a successful, unique result replaces the object.
 * Returns false when nothing may change (the game moved on, the object changed or the agent is gone).
 */
export function commitAct(g: Game, snapshot: ActSnapshot, result: ActResult, nowMs = Date.now()): boolean {
  const target = completionTarget(g, snapshot, nowMs);
  const agentIndex = g.agents.findIndex(a => a.id === snapshot.agentId);
  if (!target || agentIndex < 0) return false;
  const agent = g.agents[agentIndex];
  const outcome = actOutcome(g.settings, snapshot.before, result);
  const duplicate = outcome.ok && occupied(g, outcome.value); // Includes the object's own value.
  const cost: ActCost = outcome.ok && !duplicate ? outcome.cost : (() => {
    const decision = Math.max(MIN_FAILED_ACT_BITS, outcome.cost.decision);
    return { decision, erasure: 0, motion: 0, total: decision };
  })();
  const account = chargeAct(settledAccount(g.settings, agent, worldNow(g, nowMs)), cost.total);
  const state: AgentActState = { id: agent.id, account, acts: agent.acts + 1, spent: agent.spent + cost.total };
  g.agents[agentIndex] = { ...agent, account, acts: state.acts, spent: state.spent };
  const common = { id: randomUUID(), gameId: g.id, timestamp: nowMs, agentId: agent.id, ownerId: agent.ownerId };
  if (outcome.ok && !duplicate) {
    target.value = outcome.value; target.version++; target.scores = scoresOf(g, outcome.value);
    recordEvent(g, { ...common, type: "object.transformed", object: structuredClone(target), before: snapshot.before,
      calls: outcome.calls as MutatorCallWire[], cost, agent: state });
  } else {
    recordEvent(g, { ...common, type: "agent.failed", objectId: target.id, cost, agent: state,
      reason: outcome.ok ? "another object already has this value" : outcome.reason.slice(0, 300) });
  }
  return true;
}

export function startTicker() {
  const actingAgents = new Set<string>();
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
      const now = Date.now();
      if (game.worldSeconds + Math.max(0, now - game.lastTick) / 1000 >= game.endAtWorld) return;
      const objects = game.objects.filter(o => available(game.id, o.id));
      if (!objects.length) return;
      // Agents act only while their own energy covers their expected cost, one act at a time each.
      const agents = game.agents.filter(a => !actingAgents.has(a.id) && agentStatus(game, a, now).eligible);
      if (!agents.length) return;
      const object = objects[below(objects.length)];
      const agent = agents[below(agents.length)];
      // Copy every runtime input: cached rooms can be replaced during a serialized mutation.
      const settings = structuredClone(game.settings);
      const snapshot: ActSnapshot = {
        gameId: game.id, objectId: object.id, version: object.version, before: object.value,
        agentId: agent.id, ownerId: agent.ownerId, pauseEndsAt: game.pauseEndsAt, epoch: game.executionEpoch ?? 0,
      };
      const source = agent.source;
      actingAgents.add(agent.id);
      let released = false;
      const release = () => { if (!released) { released = true; actingAgents.delete(agent.id); } };
      return {
        roomId, gameId: game.id, objectId: object.id, rate: game.settings.interactionRateHz,
        execute: async (): Promise<ActResult> => {
          try { return { calls: (await requireAdapters().runtime.act(source, snapshot.before, settings)).calls }; }
          catch (error) {
            // The agent's own failures still cost it; host capacity problems are not its fault.
            if (isAgentFault(error)) return { error: (error as Error).message.slice(0, 300) };
            release();
            throw error;
          }
        },
        commit: async (result: unknown, current: () => boolean) => {
          try {
            if (!current() || stopped || isLocallyIdle()) return;
            await mutateInteraction(roomId, snapshot.objectId, draft => {
              const g = draft.game;
              if (!current() || stopped || isLocallyIdle() || !g) return false;
              return commitAct(g, snapshot, result as ActResult);
            }, snapshot.agentId);
          } finally { release(); }
        },
        release,
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
