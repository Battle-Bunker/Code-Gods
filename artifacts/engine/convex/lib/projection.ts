/**
 * What leaves the engine (ported from api-server projection.ts / player-api.ts). Disclosure is
 * aggregate-only: a god sees its own score of an object and aggregates over its peers (peerNetBits,
 * peerCare, payoff); the public sees salience (Σ net bits) and the leaderboard (total payoffs). Individual
 * opponents' scores and descriptors, seeds, other gods' agent sources, AI prompts and the end deadline
 * (endAtWorld) never leave. Every public query builds its result through these functions.
 */
import { instantiationOf, leaderboard, type GameSettings } from "@workspace/game-core";
import { COMMIT_CLAUSE_HELPER, instanceInfo, type InstanceInfo } from "@workspace/game-types";
import { VERSION, observationSchema, type Observation } from "@workspace/player-client";
import type { Doc } from "../_generated/dataModel";
import { DEFAULT_AGENT_MODEL } from "./aiModels";
import { agentStatus, godEnergy, viewOf, viewOfNet, worldNow } from "./world";

export const SCORING = "information-v1" as const;

type Game = Doc<"games">;
type Obj = Doc<"objects">;

const netMap = (o: Pick<Obj, "scores">) => new Map(o.scores.map(s => [s.god, s.netBits]));

export type Standing = { deityId: string; name: string; kind: "human" | "ai"; totalPayoff: number; rank: number };
export function standings(game: Pick<Game, "roster">, objects: readonly Pick<Obj, "scores">[]): Standing[] {
  const member = new Map(game.roster.map(m => [m.id, m]));
  return leaderboard(game.roster.map(m => m.id), objects.map(netMap)).map(row => ({
    deityId: row.godId, name: member.get(row.godId)!.name, kind: member.get(row.godId)!.kind, totalPayoff: row.totalPayoff, rank: row.rank,
  }));
}

/** The fully applied object type of (validated) settings, with the commit-clause helper when offered. */
export function objectInstance(settings: GameSettings): InstanceInfo {
  const info = instanceInfo(instantiationOf(settings));
  return settings.commitClause ? { ...info, helpers: [...info.helpers, COMMIT_CLAUSE_HELPER] } : info;
}

const rosterEntry = ({ id, name, kind }: Game["roster"][number]) => ({ id, name, kind });

/** A room's pointer to its single active game; null in the lobby between games. */
export function activeGameRef(game: Game | null) {
  return !game || game.phase === "ended" ? null : {
    id: game._id, shortCode: game.shortCode, phase: game.phase, startedAt: game.createdAt, roster: game.roster.map(rosterEntry),
  };
}

/** The setup a game was started from, as named then (null for games started before setups-v2). */
const gameSetup = (game: Game) => (game.setupId ? { id: game.setupId, name: game.setupName ?? "" } : null);

/** Public result of an ended game (games.summary and the room's history). */
export function gameRecord(game: Game, objects: readonly Obj[]) {
  const board = standings(game, objects);
  return {
    id: game._id, guid: game.guid, shortCode: game.shortCode, roomId: game.roomId,
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    settings: game.settings as GameSettings, setup: gameSetup(game), roster: game.roster.map(rosterEntry), leaderboard: board,
    winners: board.filter(row => row.rank === 1).map(({ deityId, name, kind }) => ({ deityId, name, kind })),
    worldSeconds: game.worldSeconds, objectCount: objects.length,
    scoring: SCORING, seasonCommitment: game.seasonCommitment,
  };
}
export type GameRecord = ReturnType<typeof gameRecord>;

/** Live or final public world state of one game: values and salience, never scores, seeds, sources or the end. */
export function publicGame(game: Game, objects: readonly Obj[], agentCount: number) {
  return {
    id: game._id, guid: game.guid, shortCode: game.shortCode, phase: game.phase, worldSeconds: game.worldSeconds,
    lastTick: game.lastTick, planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt, agentCount,
    leaderboard: standings(game, objects),
    objects: objects.map(o => ({ id: o._id, value: o.value, version: o.version, salience: o.salience })),
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    recoveryReason: game.recoveryReason ?? null,
    settings: game.settings as GameSettings, setup: gameSetup(game), roster: game.roster.map(rosterEntry),
    objectInstance: objectInstance(game.settings as GameSettings),
    seasonCommitment: game.seasonCommitment,
  };
}

type Chat = Doc<"chat">;
const chatView = (m: Chat) => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp });

/** The setup a room runs: its id, its name (live, else as last applied) and whether it was deleted since. */
export type RoomSetup = { id: string; name: string; deleted: boolean };

export function publicRoom(room: Doc<"rooms">, members: readonly Doc<"members">[], chat: readonly Chat[], active: Game | null, ownerName: string, catalog: unknown,
  setup: RoomSetup | null) {
  const settings = room.settings as GameSettings;
  return {
    id: room._id, guid: room.guid, shortCode: room.shortCode, ownerId: room.ownerId, ownerName, createdAt: room.createdAt,
    revision: room.revision, settings,
    // The game setup the room runs; `settings` is its snapshot from when it was applied (null only before setups-v2).
    setup,
    members: members.map(m => ({
      id: m.godId, name: m.name, kind: m.kind, ready: m.ready, ...(m.status ? { status: m.status } : {}),
      // The seat's library agent is public by name, provider and model; its strategy prompt is not.
      ...(m.aiAgent ? { aiAgentId: m.aiAgent.id, aiAgentRevision: m.aiAgent.revision, provider: m.aiAgent.provider, model: m.aiAgent.model } : {}),
    })),
    chat: chat.map(chatView),
    aiBudget: room.aiBudget, aiUsed: room.aiUsed, aiReservedUsd: room.aiReservedUsd,
    aiInputTokens: room.aiInputTokens, aiOutputTokens: room.aiOutputTokens,
    // The in-client assistant's pool: tokens per human per game (0 = off) and its model.
    assistantBudget: room.assistantBudget ?? 0, assistantModel: room.assistantModel ?? DEFAULT_AGENT_MODEL,
    // The lobby describes the NEXT game: its object type and the families its gods might draw, never who drew which.
    objectInstance: objectInstance(settings),
    utilityCatalog: catalog ?? null,
    activeGame: activeGameRef(active),
    // A start waiting for rule tables computed on demand: progress only (the deal stays private until the game starts).
    preparing: room.preparing ? preparingView(room.preparing) : null,
  };
}

/** The room's preparing state as everyone in it sees it (rooms.preparing): progress, never the deal. */
export function preparingView(p: NonNullable<Doc<"rooms">["preparing"]>) {
  return {
    instance: p.instance, ready: p.total - p.pending.length, total: p.total, startedAt: p.startedAt, estimateSeconds: p.estimateSeconds,
    dealtAs: p.dealer.dealtAs, ...(p.dealer.note ? { dealerNote: p.dealer.note } : {}), ...(p.error ? { error: p.error } : {}),
  };
}
/** "The game is preparing its rule tables: 12 of 18 ready (first game on Grid(7,…) on this server)." */
export function preparingLine(p: ReturnType<typeof preparingView>): string {
  if (p.error) return `Preparing the game failed: ${p.error}`;
  return `The game is preparing its rule tables: ${p.ready} of ${p.total} ready (the first game on ${p.instance} on this server; about ${p.estimateSeconds} s in all). It starts by itself when they are.`;
}

/** One god's private view of one object: its own score and peer aggregates only. */
export function personalObject(o: Obj, godId: string) {
  const own = o.scores.find(s => s.god === godId);
  if (!own) return null;
  const view = viewOf(o.scores, godId);
  return {
    id: o._id as string, value: o.value, version: o.version,
    own: { ordinal: own.ordinal, rewardBits: own.rewardBits, ...(own.penaltyBits !== undefined ? { penaltyBits: own.penaltyBits } : {}), netBits: own.netBits },
    peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff,
  };
}

/** An agent as its owner sees it. */
export function agentView(game: Game, agent: Doc<"agents">, nowMs = Date.now()) {
  const status = agentStatus(game.settings, agent, worldNow(game, nowMs));
  return {
    id: agent._id as string, source: agent.source, language: (game.settings as GameSettings).language, createdAt: agent.createdAt,
    summonCost: agent.summonCost, decisionBits: agent.decisionBits, expectedActCost: agent.expectedActCost,
    breakdown: agent.breakdown, randomized: agent.randomized, energy: status.energy, eligible: status.eligible,
    acts: agent.acts, spent: agent.spent,
  };
}

// ------------------------------------------------------------------------------------------------
// the event log, projected per viewer
// ------------------------------------------------------------------------------------------------

type Batch = Doc<"tickBatches">;
type Ev = Batch["events"][number];

/**
 * One event as god `godId` (roster index `index`, -1 for a spectator) may see it. Spawns and transforms
 * carry the object value plus the viewer's own net bits and peer aggregates; only an agent's owner learns
 * which calls it made and what they cost; failed acts are the owner's private bookkeeping.
 */
export function projectEvent(ev: Ev, godId: string, index: number) {
  if (ev.t === "phase") return { type: "phase" as const, phase: ev.phase, worldSeconds: ev.world, ...(ev.reason ? { reason: ev.reason } : {}) };
  if (ev.t === "fail") {
    if (ev.ownerId !== godId) return null;
    return { type: "agent.failed" as const, objectId: ev.objectId, agentId: ev.agentId, worldSeconds: ev.world, reason: ev.reason, cost: ev.cost };
  }
  const own = index >= 0 ? viewOfNet(ev.net, index) : null;
  const scored = own ? { own: { netBits: own.netBits }, peerNetBits: own.peerNetBits, peerCare: own.peerCare, payoff: own.payoff } : {};
  if (ev.t === "spawn") {
    return { type: "object.spawned" as const, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.world, ...scored };
  }
  const mine = ev.ownerId === godId;
  return {
    type: "object.transformed" as const, objectId: ev.objectId, value: ev.value, before: ev.before, version: ev.version,
    worldSeconds: ev.world, agentId: ev.agentId, mine, ...(mine ? { calls: ev.calls, cost: ev.cost } : {}), ...scored,
  };
}
export type ProjectedEvent = NonNullable<ReturnType<typeof projectEvent>>;

/** The viewer's events of a list of batches, each tagged with its batch seq. */
export function projectBatches(batches: readonly Batch[], godId: string, index: number) {
  const out: (ProjectedEvent & { seq: number })[] = [];
  for (const batch of batches) for (const ev of batch.events) {
    const projected = projectEvent(ev, godId, index);
    if (projected) out.push({ ...projected, seq: batch.seq });
  }
  return out;
}

/** Per-object series of the viewer's own bits and peer aggregates (the Panel SDK's trajectories). */
export function trajectories(batches: readonly Batch[], index: number) {
  const series = new Map<string, { seq: number; worldSeconds: number; value: number | string; ownNetBits: number; peerNetBits: number; payoff: number }[]>();
  for (const batch of batches) for (const ev of batch.events) {
    if (ev.t !== "spawn" && ev.t !== "transform") continue;
    const view = viewOfNet(ev.net, index);
    let points = series.get(ev.objectId);
    if (!points) series.set(ev.objectId, points = []);
    points.push({ seq: batch.seq, worldSeconds: ev.world, value: ev.value, ownNetBits: view.netBits, peerNetBits: view.peerNetBits, payoff: view.payoff });
  }
  return [...series].map(([objectId, points]) => ({ objectId, points }));
}

// ------------------------------------------------------------------------------------------------
// protocol v3 observation
// ------------------------------------------------------------------------------------------------

export type ObservationInput = {
  room: Doc<"rooms">; game: Game | null; self: { godId: string; name: string; kind: "human" | "ai"; ready: boolean };
  deity: Doc<"deities"> | null; objects: readonly Obj[]; agents: readonly Doc<"agents">[];
  transformations: readonly { id: string; agentId: string; before: number | string; after: number | string; calls?: unknown; cost?: number }[];
  chat: readonly Chat[]; nowMs?: number;
};

/** Protocol v3 observation: own scores and peer aggregates, own agents, the instance and the kid card. */
export function observation(input: ObservationInput): Observation {
  const { room, game, self, deity } = input, now = input.nowMs ?? Date.now();
  const settings = (game?.settings ?? room.settings) as GameSettings;
  return observationSchema.parse({
    version: VERSION, roomId: room._id, revision: room.seq + (game?.tick.seq ?? 0),
    roomShortCode: room.shortCode, gameShortCode: game?.shortCode, seated: !!deity,
    gameId: game?._id, planningEndsAt: game?.planningEndsAt, pauseEndsAt: game?.pauseEndsAt,
    phase: game?.phase === "recovery" ? "paused" : game?.phase ?? "lobby",
    language: settings.language,
    instance: objectInstance(settings),
    economy: {
      energyPerSecond: settings.energyPerSecond, agentEnergyPerSecond: settings.agentEnergyPerSecond,
      agentBatteryActs: settings.agentBatteryActs, maxAgentsPerGod: settings.maxAgentsPerGod,
      penaltyWeight: settings.penaltyWeight, worldSeconds: game ? worldNow(game, now) : 0,
      perActFloorBits: settings.perActFloorBits, commitClause: settings.commitClause, objectSelection: settings.objectSelection,
    },
    self: {
      godId: self.godId, label: self.name, isAI: self.kind === "ai", ready: self.ready,
      utility: game && deity ? deity.card : undefined, pauseUsed: deity?.pauseUsed ?? false,
      energy: game && deity ? godEnergy(game, deity.spent, now) : 0,
    },
    objects: game && deity ? input.objects.flatMap(o => {
      const view = personalObject(o, self.godId);
      return view ? [{ id: view.id, value: view.value, own: view.own, peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff }] : [];
    }) : [],
    agents: game ? input.agents.filter(a => a.ownerId === self.godId).map(a => agentView(game, a, now)) : [],
    transformations: input.transformations.slice(-500).map(t => ({
      id: t.id, agentId: t.agentId, before: t.before, after: t.after,
      ...(Array.isArray(t.calls) ? { calls: t.calls.slice(0, 16) } : {}), ...(t.cost !== undefined ? { cost: t.cost } : {}),
    })),
    leaderboard: game ? standings(game, input.objects).map(s => ({ godId: s.deityId, label: s.name, isAI: s.kind === "ai", totalPayoff: s.totalPayoff })) : [],
    chat: input.chat.slice(-100).map(m => ({ id: m._id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text.slice(0, 2000) })),
  });
}
