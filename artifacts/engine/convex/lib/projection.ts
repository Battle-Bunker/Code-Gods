/**
 * What leaves the engine (ported from api-server projection.ts / player-api.ts). Disclosure is
 * aggregate-only: a god sees its own score of an object and aggregates over its peers (peerNetBits,
 * peerCare, payoff); the public sees salience (Σ net bits) and the leaderboard (total payoffs). Individual
 * opponents' scores and descriptors, seeds, other gods' agent sources, AI prompts and the end deadline
 * (endAtWorld) never leave. Every public query builds its result through these functions.
 */
import { biddingView } from "../bidding";
import { agentDisplayName } from "./agentName";
import { gameNotice } from "./engineErrors";
import { godLooks, allowedLanguages, costModelOf, deityIncome, roundShare, instantiationOf, leaderboard, paidObservation, rankTotals, type GameSettings } from "@workspace/game-core";
import { lookPriceOf } from "./knowledge";
import { CHANGE_READ_RATIO, COMMIT_CLAUSE_HELPER, instanceInfo, type InstanceInfo } from "@workspace/game-types";
import { VERSION, observationSchema, type Observation } from "@workspace/player-client";
import type { Doc } from "../_generated/dataModel";
import type { ClockedGame, Scoreboard } from "../game/state";
import { DEFAULT_AGENT_MODEL } from "./aiModels";
import { aiQuotaOf, assistantQuotaOf } from "./aiAccess";
import { NO_FAILURES, diagnoseAgent } from "./futility";
import { agentCapacityOf, agentIncomeOf, deityCapacityOf, fullChargeOf, powerOf } from "./power";
import { agentStatus, disclosedTotalsOf, godEnergy, totalsOf, viewOf, viewOfNet, worldNow } from "./world";
import { agentLanguage } from "./language";

export const SCORING = "information-v1" as const;

type Game = Doc<"games">;
type Obj = Doc<"objects">;

const netMap = (o: Pick<Obj, "scores">) => new Map(o.scores.map(s => [s.god, s.netBits]));

export type Standing = { deityId: string; name: string; kind: "human" | "ai"; totalPayoff: number; rank: number };
/**
 * The public leaderboard: the published scoreboard (docs/public-log-design.md §3), which changes for everyone at once
 * every scoreIntervalSeconds of world time; live totals only for a game started before scoreboards existed.
 */
export function standings(game: Pick<Game, "roster"> & { scoreboard?: Scoreboard }, objects: readonly Pick<Obj, "scores">[]): Standing[] {
  const member = new Map(game.roster.map(m => [m.id, m]));
  const rows = game.scoreboard ? rankTotals(game.roster.map(m => m.id), game.scoreboard.totals) : leaderboard(game.roster.map(m => m.id), objects.map(netMap));   // (a game from before scoreboards has no handicaps)
  return rows.map(row => ({
    deityId: row.godId, name: member.get(row.godId)!.name, kind: member.get(row.godId)!.kind, totalPayoff: row.totalPayoff, rank: row.rank,
  }));
}

/** The fully applied object type of (validated) settings, with the commit-clause helper when offered. */
export function objectInstance(settings: GameSettings): InstanceInfo {
  const info = instanceInfo(instantiationOf(settings), costModelOf(settings));
  return settings.commitClause ? { ...info, helpers: [...info.helpers, COMMIT_CLAUSE_HELPER] } : info;
}

export const rosterEntry = ({ id, name, kind }: Game["roster"][number]) => ({ id, name, kind });

/** A room's pointer to its single active game; null in the lobby between games. */
export function activeGameRef(game: Game | null) {
  return !game || game.phase === "ended" ? null : {
    id: game._id, shortCode: game.shortCode, phase: game.phase, startedAt: game.createdAt, roster: game.roster.map(rosterEntry),
  };
}

/** The setup a game was started from, as named then (null for games started before setups-v2). */
export const gameSetup = (game: Game) => (game.setupId ? { id: game.setupId, name: game.setupName ?? "" } : null);

/** Public result of an ended game (games.summary and the room's history). */
export function gameRecord(game: ClockedGame, objects: readonly Obj[]) {
  const board = standings(game, objects);
  return {
    id: game._id, guid: game.guid, shortCode: game.shortCode, roomId: game.roomId,
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    settings: game.settings as GameSettings, setup: gameSetup(game), roster: game.roster.map(rosterEntry), leaderboard: board,
    spectators: game.spectators,
    winners: board.filter(row => row.rank === 1).map(({ deityId, name, kind }) => ({ deityId, name, kind })),
    worldSeconds: game.worldSeconds, objectCount: objects.length,
    scoring: SCORING, seasonCommitment: game.seasonCommitment,
  };
}
export type GameRecord = ReturnType<typeof gameRecord>;

/** Live or final public world state of one game: values and salience, never scores, seeds, sources or the end. */
export function publicGame(game: ClockedGame, objects: readonly Obj[]) {
  return {
    id: game._id, guid: game.guid, shortCode: game.shortCode, phase: game.phase, worldSeconds: game.worldSeconds,
    lastTick: game.lastTick, planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt, agentCount: game.agentCount,
    leaderboard: standings(game, objects), leaderboardWorldSeconds: game.scoreboard?.world ?? null,
    // Live, salience carries the version's disclosure noise (the same as every seated player's peers' sum, so own +
    // others = salience still holds for each of them and nothing can be averaged); ended, it is exact.
    objects: objects.map(o => ({ id: o._id, value: o.value, version: o.version, salience: o.salience + (game.phase !== "ended" ? o.noise ?? 0 : 0) })),
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    recoveryReason: game.recoveryReason ?? null, notice: gameNotice(game) ?? null,
    settings: game.settings as GameSettings, setup: gameSetup(game), roster: game.roster.map(rosterEntry), spectators: game.spectators,
    objectInstance: objectInstance(game.settings as GameSettings),
    seasonCommitment: game.seasonCommitment,
  };
}

type Chat = Doc<"chat">;
export const chatView = (m: Chat) => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp });

/** The setup a room runs: its id, its name (live, else as last applied) and whether it was deleted since. */
export type RoomSetup = { id: string; name: string; deleted: boolean };

export function publicRoom(room: Doc<"rooms">, members: readonly Doc<"members">[], chat: readonly Chat[], active: Game | null, ownerName: string, catalog: unknown,
  setup: RoomSetup | null, aiEnabled: boolean) {
  const settings = room.settings as GameSettings;
  return {
    id: room._id, guid: room.guid, shortCode: room.shortCode, ownerId: room.ownerId, ownerName, createdAt: room.createdAt,
    revision: room.revision, settings,
    // The game setup the room runs; `settings` is its snapshot from when it was applied (null only before setups-v2).
    setup,
    members: members.map(m => ({
      id: m.godId, name: m.name, kind: m.kind, ready: m.ready, spectator: m.spectator, ...(m.status ? { status: m.status } : {}),
      // The seat's library agent is public by name, provider and model; its strategy prompt is not.
      ...(m.aiAgent ? { aiAgentId: m.aiAgent.id, aiAgentRevision: m.aiAgent.revision, provider: m.aiAgent.provider, model: m.aiAgent.model } : {}),
    })),
    chat: chat.map(chatView),
    // AI (seats and the assistant) is available only in rooms whose owner is an administrator (lib/aiAccess.ts).
    aiEnabled,
    // The AI players' per-game token quota (all seats together; 0 = none) and this game's usage.
    aiQuota: aiQuotaOf(room), aiUsed: room.aiUsed, aiReservedUsd: room.aiReservedUsd,
    aiInputTokens: room.aiInputTokens, aiOutputTokens: room.aiOutputTokens,
    // The in-client assistant: each player's per-game token quota (0 = none) and its model.
    assistantQuota: assistantQuotaOf(room), assistantModel: room.assistantModel ?? DEFAULT_AGENT_MODEL,
    // The lobby describes the NEXT game: its object type and the families its gods might draw, never who drew which.
    objectInstance: objectInstance(settings),
    utilityCatalog: catalog ?? null,
    activeGame: activeGameRef(active),
    // A start waiting for rule tables computed on demand: progress only (the deal stays private until the game starts).
    preparing: room.preparing ? preparingView(room.preparing) : null,
    // A start in its bid phase (bidding.ts): its clock and how many play. Bids are private (bidding.mine: the caller's own).
    bidding: room.bidding ? biddingView(room.bidding) : null,
  };
}

/** The room's preparing state as everyone in it sees it (rooms.preparing): progress, never the deal. */
export function preparingView(p: NonNullable<Doc<"rooms">["preparing"]>) {
  return {
    instance: p.instance, ready: p.total - p.pending.length, total: p.total, startedAt: p.startedAt, estimateSeconds: p.estimateSeconds,
    dealtAs: p.dealer.dealtAs, ...(p.dealer.note ? { dealerNote: p.dealer.note } : {}), ...(p.error ? { error: p.error } : {}),
    // The computation's pieces, when some table is split into several (architecture.md §3.2).
    ...(p.pieces ? { pieces: p.pieces } : {}),
  };
}
/** "The game is preparing its rule tables: 12 of 18 ready, 41 of 60 parts computed (first game on Grid(7,…) on this server)." */
export function preparingLine(p: ReturnType<typeof preparingView>): string {
  if (p.error) return `Preparing the game failed: ${p.error}`;
  const parts = p.pieces ? `, ${p.pieces.done} of ${p.pieces.total} parts computed` : "";
  return `The game is preparing its rule tables: ${p.ready} of ${p.total} ready${parts} (the first game on ${p.instance} on this server; about ${p.estimateSeconds} s in all). It starts by itself when they are.`;
}

/** One god's private view of one object: its own score and peer aggregates only (`live`: the peers' sum with its noise). */
export function personalObject(o: Obj, godId: string, live: boolean) {
  const own = o.scores.find(s => s.god === godId);
  if (!own) return null;
  const view = viewOf(o.scores, godId, live ? o.noise ?? 0 : 0);
  return {
    id: o._id as string, value: o.value, version: o.version,
    // Public figures (docs/public-log-design.md §2): the transformation count, the spawn time and the last transformation time.
    mutations: o.version, createdAt: o.createdAt ?? 0, lastMutatedAt: o.lastMutatedAt ?? null,
    own: { ordinal: own.ordinal, rewardBits: own.rewardBits, ...(own.penaltyBits !== undefined ? { penaltyBits: own.penaltyBits } : {}), netBits: own.netBits },
    peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff,
  };
}

/**
 * A summon's estimated cost per act as {read, change} (docs/energy-model.md §5). An event-log schema ≤ 4 summon (history)
 * shows its change part only: its decision and floor are no longer charged.
 */
export function costBreakdown(b: { read: number; change: number } | { decision: number; erasure: number; motion: number; floor: number }): { read: number; change: number } {
  return "read" in b ? { read: b.read, change: b.change } : { read: 0, change: b.erasure + b.motion };
}
/**
 * One act's charge as {read, change, total}. An event-log schema ≤ 4 charge (history) keeps its exact total, and its
 * erasure and motion as the change; its decision and floor were a fixed price, not reading, so `read` is 0 and the total
 * is more than the parts.
 */
export function actCost(c: { read: number; change: number; total: number } | { decision: number; erasure: number; motion: number; floor: number; total: number }) {
  return "read" in c ? { read: c.read, change: c.change, total: c.total } : { read: 0, change: c.erasure + c.motion, total: c.total };
}

/** An account's capacity for the wire (docs/energy-model.md §6.1); absent when the game has none (JSON has no Infinity). */
const capacityField = (capacity: number) => Number.isFinite(capacity) ? { capacity } : {};

/** An agent as its owner sees it. */
export function agentView(game: ClockedGame, agent: Doc<"agents">, nowMs = Date.now(), ordinal = 0) {
  const status = agentStatus(game.settings, agent, worldNow(game, nowMs));
  return {
    id: agent._id as string, name: agentDisplayName(agent.name, ordinal), ...(agent.description ? { description: agent.description } : {}), source: agent.source, language: agentLanguage(agent, game.settings as GameSettings), createdAt: agent.createdAt,
    summonCost: agent.summonCost, expectedActCost: agent.expectedActCost,
    breakdown: costBreakdown(agent.breakdown), randomized: agent.randomized, energy: status.energy, eligible: status.eligible,
    powerShare: agent.powerShare, income: agentIncomeOf(agent, game.settings), ...capacityField(agentCapacityOf(agent, game.settings)),
    acts: agent.acts, spent: agent.spent, ...(agent.spentRead !== undefined ? { spentRead: agent.spentRead } : {}), skips: agent.skips ?? 0,
    ...agentOutcomes(agent),
  };
}

/** The owner's breakdown of how the agent's acts ended (counted by the tick) and its diagnosis (lib/futility.ts). */
export function agentOutcomes(agent: Pick<Doc<"agents">, "transforms" | "failures" | "lastFailures">) {
  if (agent.failures === undefined && agent.transforms === undefined) return {};
  const outcomes = { transforms: agent.transforms ?? 0, failures: { ...NO_FAILURES, ...agent.failures }, ...(agent.lastFailures ? { lastFailures: agent.lastFailures } : {}) };
  const diagnosis = diagnoseAgent(outcomes);
  return { outcomes, ...(diagnosis ? { diagnosis } : {}) };
}

// ------------------------------------------------------------------------------------------------
// the event log, projected per viewer
// ------------------------------------------------------------------------------------------------

type Batch = Doc<"tickBatches">;
type Ev = Batch["events"][number];

/**
 * One event as god `godId` (roster index `index`, -1 for a spectator) may see it. Spawns and transforms
 * carry the object value plus the viewer's own net bits and peer aggregates. Every transformation reaches every
 * viewer; while the game is `live` (not ended) only an agent's owner learns which agent made it, and others' summons
 * and destructions are withheld (docs/public-log-design.md §1). Calls, costs and failed acts are the owner's own.
 */
export function projectEvent(ev: Ev, godId: string, index: number, live = true) {
  if (ev.t === "phase") return { type: "phase" as const, phase: ev.phase, worldSeconds: ev.world, ...(ev.reason ? { reason: ev.reason } : {}) };
  if (ev.t === "summon") {
    // While the game is live only the owner sees its summons (docs/public-log-design.md §1): another god's summon
    // would date that god's agent and so attribute the transformations that follow it (the live agent count stays
    // public as an aggregate). After the end everyone sees that it appeared; only its owner learns its record.
    const mine = ev.ownerId === godId;
    if (live && !mine) return null;
    return {
      type: "agent.summoned" as const, agentId: ev.agentId, mine, worldSeconds: ev.world,
      ...(mine ? {
        name: ev.name, ...(ev.description ? { description: ev.description } : {}), language: ev.language, source: ev.source, summonCost: ev.summonCost, expectedActCost: ev.expectedActCost,
        ...(ev.powerShare !== undefined ? { powerShare: ev.powerShare } : {}),
        breakdown: costBreakdown(ev.breakdown), randomized: ev.randomized, account: ev.account,
      } : {}),
    };
  }
  if (ev.t === "destroy") {
    const mine = ev.ownerId === godId;
    // `owed` (the debt that moved to its god with its power, §7.2) is the owner's own account: theirs alone while live.
    return live && !mine ? null : { type: "agent.destroyed" as const, agentId: ev.agentId, mine, worldSeconds: ev.world, ...(mine && ev.owed !== undefined ? { owed: ev.owed } : {}) };
  }
  if (ev.t === "power") {
    if (ev.ownerId !== godId) return null;
    return { type: "agent.power" as const, agentId: ev.agentId, worldSeconds: ev.world, share: ev.share, ...(ev.owed !== undefined ? { owed: ev.owed } : {}) };
  }
  if (ev.t === "look") {
    // A god's looks are its own while the game is live (what it chose to watch says what it cares about).
    if (live && ev.ownerId !== godId) return null;
    return { type: "god.looked" as const, mine: ev.ownerId === godId, worldSeconds: ev.world, price: ev.cost, count: ev.count, ...(ev.objectId ? { objectId: ev.objectId } : {}) };
  }
  if (ev.t === "fail") {
    if (ev.ownerId !== godId) return null;
    return { type: "agent.failed" as const, objectId: ev.objectId, agentId: ev.agentId, worldSeconds: ev.world, reason: ev.reason, cost: actCost(ev.cost) };
  }
  if (ev.t === "skip") {
    if (ev.ownerId !== godId) return null;
    return { type: "agent.skipped" as const, objectId: ev.objectId, agentId: ev.agentId, worldSeconds: ev.world, cost: actCost(ev.cost) };
  }
  // Live, the peers' sum carries the version's disclosure noise (settings.peerNoiseBits); ended, it is exact.
  const own = index >= 0 ? viewOfNet(ev.net, index, live ? ev.noise ?? 0 : 0) : null;
  const scored = own ? { own: { netBits: own.netBits }, peerNetBits: own.peerNetBits, peerCare: own.peerCare, payoff: own.payoff } : {};
  if (ev.t === "spawn") {
    return { type: "object.spawned" as const, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.world, ...scored };
  }
  // Hold rarity applied during planning (docs/energy-model.md §8): the same version, re-scored.
  if (ev.t === "rescore") {
    return { type: "object.rescored" as const, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.world, ...scored };
  }
  // Every transformation is public; while the game is live it is unattributed (docs/public-log-design.md §1): another
  // god's carries no agent id, owner, calls or charge. Only the viewer's own carry its agent, calls and cost.
  const mine = ev.ownerId === godId;
  return {
    type: "object.transformed" as const, objectId: ev.objectId, value: ev.value, before: ev.before, version: ev.version,
    worldSeconds: ev.world, mine, ...(mine || !live ? { agentId: ev.agentId } : {}), ...(mine ? { calls: ev.calls, cost: actCost(ev.cost) } : {}), ...scored,
  };
}
export type ProjectedEvent = NonNullable<ReturnType<typeof projectEvent>>;

/** The viewer's events of a list of batches, each tagged with its batch seq (`live`: the game has not ended). */
export function projectBatches(batches: readonly Batch[], godId: string, index: number, live: boolean) {
  const out: (ProjectedEvent & { seq: number })[] = [];
  for (const batch of batches) for (const ev of batch.events) {
    const projected = projectEvent(ev, godId, index, live);
    if (projected) out.push({ ...projected, seq: batch.seq });
  }
  return out;
}

/**
 * One logged event in full, for the replay of an ENDED game (player.replay): ended games are fully transparent, so
 * nothing is projected away. `net` is every roster god's net bits after the event (roster order); `ownerId`
 * attributes every act and agent; `seed` is the act's derived seed (schema 3).
 */
export function replayEvent(ev: Ev) {
  switch (ev.t) {
    case "phase": return { type: "phase" as const, phase: ev.phase, worldSeconds: ev.world, ...(ev.reason ? { reason: ev.reason } : {}) };
    case "spawn": return { type: "object.spawned" as const, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.world, net: ev.net };
    case "rescore": return { type: "object.rescored" as const, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.world, net: ev.net };
    case "transform": return {
      type: "object.transformed" as const, objectId: ev.objectId, before: ev.before, value: ev.value, version: ev.version, worldSeconds: ev.world,
      agentId: ev.agentId, ownerId: ev.ownerId, calls: ev.calls, cost: actCost(ev.cost), net: ev.net, ...(ev.seed ? { seed: ev.seed } : {}),
    };
    case "fail": return {
      type: "agent.failed" as const, objectId: ev.objectId, worldSeconds: ev.world, agentId: ev.agentId, ownerId: ev.ownerId, reason: ev.reason, cost: actCost(ev.cost),
      ...(ev.seed ? { seed: ev.seed } : {}), ...(ev.error ? { error: true as const } : {}),
    };
    case "skip": return {
      type: "agent.skipped" as const, objectId: ev.objectId, worldSeconds: ev.world, agentId: ev.agentId, ownerId: ev.ownerId, cost: actCost(ev.cost),
      ...(ev.seed ? { seed: ev.seed } : {}),
    };
    case "summon": return {
      type: "agent.summoned" as const, agentId: ev.agentId, ownerId: ev.ownerId, worldSeconds: ev.world, language: ev.language, source: ev.source,
      ...(ev.name ? { name: ev.name } : {}), ...(ev.description ? { description: ev.description } : {}),
      summonCost: ev.summonCost, expectedActCost: ev.expectedActCost, ...(ev.powerShare !== undefined ? { powerShare: ev.powerShare } : {}),
      breakdown: costBreakdown(ev.breakdown), randomized: ev.randomized, account: ev.account,
    };
    case "destroy": return { type: "agent.destroyed" as const, agentId: ev.agentId, ownerId: ev.ownerId, worldSeconds: ev.world, ...(ev.owed !== undefined ? { owed: ev.owed } : {}) };
    case "power": return { type: "agent.power" as const, agentId: ev.agentId, ownerId: ev.ownerId, worldSeconds: ev.world, share: ev.share, ...(ev.owed !== undefined ? { owed: ev.owed } : {}) };
    case "look": return { type: "god.looked" as const, ownerId: ev.ownerId, worldSeconds: ev.world, price: ev.cost, count: ev.count, ...(ev.objectId ? { objectId: ev.objectId } : {}) };
  }
}
export type ReplayEventOut = ReturnType<typeof replayEvent>;

/** The replay's pages: every event of each batch in full, with the batch's wall time and world window (totals follow exactly from `net`). */
export function replayBatches(batches: readonly (Batch & { from?: number })[]) {
  return batches.map(b => ({
    seq: b.seq, at: b.at, worldFrom: b.worldFrom, worldTo: b.worldTo, ...(b.from ? { from: b.from } : {}),
    events: b.events.map(replayEvent),
  }));
}

/** Per-object series of the viewer's own bits and peer aggregates (the Panel SDK's trajectories). */
export function trajectories(batches: readonly Batch[], index: number, live: boolean) {
  const series = new Map<string, { seq: number; worldSeconds: number; value: number | string; ownNetBits: number; peerNetBits: number; payoff: number }[]>();
  for (const batch of batches) for (const ev of batch.events) {
    if (ev.t !== "spawn" && ev.t !== "transform" && ev.t !== "rescore") continue;
    const view = viewOfNet(ev.net, index, live ? ev.noise ?? 0 : 0);
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
  room: Doc<"rooms">; game: ClockedGame | null; self: { godId: string; name: string; kind: "human" | "ai"; ready: boolean };
  deity: Doc<"deities"> | null; objects: readonly Obj[]; agents: readonly Doc<"agents">[];
  transformations: readonly { id: string; agentId: string; before: number | string; after: number | string; calls?: unknown; cost?: number }[];
  chat: readonly Chat[]; nowMs?: number;
  /** The allowed languages' sandbox readiness (runtime/readiness.ts sandboxViews). */
  sandboxes?: readonly { language: string; state: string; reason?: string }[];
  /**
   * A narrow observation (lib/load.ts NarrowObjects): the god's objects as its objectViews rows show them and its
   * godTotals score, in place of `objects` (then empty: the leaderboard is the published scoreboard).
   */
  views?: readonly { id: string; value: number | string; own: { ordinal: number | number[]; rewardBits: number; penaltyBits?: number; netBits: number }; peerNetBits: number; peerCare: number; payoff: number;
    /** Paid observation: the world time the god was last told this object (lib/knowledge.ts). */
    knownAt?: number }[];
  score?: number;
};

/** Protocol v3 observation: own scores and peer aggregates, own agents, the instance and the kid card. */
export function observation(input: ObservationInput): Observation {
  const { room, game, self, deity } = input, now = input.nowMs ?? Date.now();
  const settings = (game?.settings ?? room.settings) as GameSettings;
  const notice = game ? gameNotice(game) : undefined;
  return observationSchema.parse({
    // Grows with every room change and every commit that moves the world (the world clock, in ms).
    version: VERSION, roomId: room._id, revision: room.seq + Math.round((game?.worldSeconds ?? 0) * 1000),
    roomShortCode: room.shortCode, gameShortCode: game?.shortCode, seated: !!deity,
    gameId: game?._id, planningEndsAt: game?.planningEndsAt, pauseEndsAt: game?.pauseEndsAt,
    phase: game?.phase === "recovery" ? "paused" : game?.phase ?? "lobby",
    ...(notice ? { notice } : {}),
    ...(game?.phase === "ended" && game.endReason ? { endReason: game.endReason } : {}),
    language: allowedLanguages(settings)[0], languages: allowedLanguages(settings),
    ...(game?.holdState ? { holdRarity: { state: game.holdState, ...(game.holdState === "failed" && game.holdError ? { reason: game.holdError } : {}) } } : {}),
    ...(input.sandboxes ? { sandboxes: input.sandboxes.map(s => ({ language: s.language, state: s.state, ...(s.reason ? { reason: s.reason } : {}) })) } : {}),
    instance: objectInstance(settings),
    economy: {
      powerPerSecond: powerOf(settings), startingEnergy: settings.startingEnergy,
      ...(fullChargeOf(settings) !== undefined ? { fullChargeSeconds: fullChargeOf(settings) } : {}),
      changeReadRatio: CHANGE_READ_RATIO, maxAgentsPerGod: settings.maxAgentsPerGod, fullRead: lookPriceOf(settings),
      penaltyWeight: settings.penaltyWeight, worldSeconds: game ? worldNow(game, now) : 0,
      durationMode: settings.durationMode, lengthSeconds: settings.halfLifeSeconds,
      commitClause: settings.commitClause, objectSelection: settings.objectSelection, costModel: costModelOf(settings),
      // Paid observation (lib/knowledge.ts): objects are shown as last told (`knownAt`); one look at one object costs lookPrice.
      ...(paidObservation(settings) ? { observation: settings.observation, ...(godLooks(settings) ? { lookPrice: lookPriceOf(settings) } : {}) } : {}),
    },
    self: {
      godId: self.godId, label: self.name, isAI: self.kind === "ai", ready: self.ready,
      utility: game && deity ? deity.card : undefined, pauseUsed: deity?.pauseUsed ?? false,
      energy: game && deity ? godEnergy(game, deity, worldNow(game, now)) : 0,
      // Power (docs/energy-model.md §6): the share its agents hold, and its own income from the rest.
      ...(game && deity ? (() => {
        return { allocated: deity.allocated, income: deityIncome(powerOf(settings), deity.allocated), ...capacityField(deityCapacityOf(deity, settings)) };
      })() : {}),
      // The own score is live; the leaderboard below is the scoreboard last published.
      // Live, it is the sum of the payoffs as disclosed (from the noisy peers' sums), consistent with the scoreboard.
      ...(game && deity ? { score: input.score ?? (game.phase === "ended" ? totalsOf : disclosedTotalsOf)(game.roster.map(m => m.id), input.objects, game.handicaps)[game.roster.findIndex(m => m.id === self.godId)] } : {}),
    },
    objects: game && deity ? input.views?.map(o => ({ id: o.id, value: o.value, own: o.own, peerNetBits: o.peerNetBits, peerCare: o.peerCare, payoff: o.payoff, ...(o.knownAt !== undefined ? { knownAt: o.knownAt } : {}) })) ?? input.objects.flatMap(o => {
      const view = personalObject(o, self.godId, game.phase !== "ended");
      return view ? [{ id: view.id, value: view.value, own: view.own, peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff }] : [];
    }) : [],
    agents: game ? input.agents.filter(a => a.ownerId === self.godId).map((a, i) => agentView(game, a, now, i)) : [],
    transformations: input.transformations.slice(-500).map(t => ({
      id: t.id, agentId: t.agentId, before: t.before, after: t.after,
      ...(Array.isArray(t.calls) ? { calls: t.calls.slice(0, 16) } : {}), ...(t.cost !== undefined ? { cost: t.cost } : {}),
    })),
    leaderboard: game ? standings(game, input.objects).map(s => ({ godId: s.deityId, label: s.name, isAI: s.kind === "ai", totalPayoff: s.totalPayoff })) : [],
    ...(game?.scoreboard ? { leaderboardWorldSeconds: game.scoreboard.world } : {}),
    chat: input.chat.slice(-100).map(m => ({ id: m._id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text.slice(0, 2000) })),
  });
}
