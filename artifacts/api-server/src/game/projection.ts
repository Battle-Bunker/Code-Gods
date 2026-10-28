/**
 * What leaves the server. Disclosure is aggregate-only: a god sees its own score of an object and
 * aggregates over its peers (peerNetBits, peerCare, payoff); the public sees salience (Σ net bits)
 * and the leaderboard (total payoffs). Individual opponents' scores, descriptors, seeds, agent
 * sources and the end deadline never leave.
 */
import { instantiationOf, leaderboard, personalView, salience, type GameSettings } from "@workspace/game-core";
import { instanceInfo, type InstanceInfo } from "@workspace/game-types";
import { card, context, publicCatalog, type CatalogEntry } from "@workspace/game-utilities";
import type { Room, Game, Chat, WorldObject, Agent } from "./types";
import { agentStatus, godEnergy } from "./economy";

/** Scoring marker on new history records; records without it were scored by the legacy [0, 1] rules. */
export const SCORING = "information-v1" as const;
const isLegacy = (game: Game) => game.scoring !== SCORING;

const netMap = (o: WorldObject) => new Map(Object.entries(o.scores ?? {}).map(([id, s]) => [id, s.netBits]));
/** Objects scored by every god in the roster (legacy objects carry no scores). */
const fullyScored = (game: Game, o: WorldObject) => !!o.scores && game.roster.every(m => m.id in o.scores);
const scoredObjects = (game: Game) => game.objects.filter(o => fullyScored(game, o));

export type Standing = { deityId: string; name: string; kind: "human" | "ai"; totalPayoff: number; rank: number };
export function standings(game: Game): Standing[] {
  const member = (id: string) => game.roster.find(m => m.id === id)!;
  if (isLegacy(game)) return game.roster.map(m => ({ deityId: m.id, name: m.name, kind: m.kind, totalPayoff: 0, rank: 1 }));
  return leaderboard(game.roster.map(m => m.id), scoredObjects(game).map(netMap))
    .map(row => ({ deityId: row.godId, name: member(row.godId).name, kind: member(row.godId).kind, totalPayoff: row.totalPayoff, rank: row.rank }));
}

/** A god's own kid card: plain-language incentives first, then source in the game's language, plus any defence goal. */
export function utilityCard(game: Game, id: string) {
  const deity = game.deities.find(d => d.id === id);
  if (!deity || isLegacy(game)) return null;
  const language = game.settings.language;
  const c = card(deity.utility, context(instantiationOf(game.settings)));
  return {
    familyId: c.familyId, emoji: c.emoji, name: c.name, theme: c.theme, summary: c.summary, shape: c.shape,
    language, source: c.source[language],
    ...(c.penalty ? { penalty: {
      familyId: c.penalty.familyId, emoji: c.penalty.emoji, name: c.penalty.name, summary: c.penalty.summary,
      comparative: c.penalty.comparative, shape: c.penalty.shape, source: c.penalty.source[language],
    } } : {}),
  };
}
export type UtilityCardView = NonNullable<ReturnType<typeof utilityCard>>;

/** One god's private view of one object: its own score and peer aggregates only. */
export function personalObject(game: Game, o: WorldObject, id: string) {
  const own = o.scores?.[id];
  if (!own || !fullyScored(game, o)) return null;
  const view = personalView(netMap(o), id);
  return {
    id: o.id, value: o.value, version: o.version,
    own: { ordinal: own.ordinal, rewardBits: own.rewardBits, ...(own.penaltyBits !== undefined ? { penaltyBits: own.penaltyBits } : {}), netBits: own.netBits },
    peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff,
  };
}

/** An agent as its owner sees it: settled energy, eligibility, acts and bits spent. */
export function agentView(game: Game, agent: Agent, nowMs = Date.now()) {
  const status = agentStatus(game, agent, nowMs);
  return {
    id: agent.id, source: agent.source, createdAt: agent.createdAt, summonCost: agent.summonCost,
    expectedActCost: agent.expectedActCost, energy: status.energy, eligible: status.eligible,
    acts: agent.acts, spent: agent.spent,
  };
}

/** The fully applied object type (InstanceInfo), or null for settings no longer valid (legacy games). */
export function objectInstance(settings: GameSettings): InstanceInfo | null {
  try { return instanceInfo(instantiationOf(settings)); } catch { return null; }
}
/** The public catalog of families any god might draw here, with availability, badges and locked reasons. */
export function catalogFor(settings: GameSettings): CatalogEntry[] {
  try { return publicCatalog(instantiationOf(settings)); } catch { return []; }
}
const rosterEntry = ({ id, name, kind }: Game["roster"][number]) => ({ id, name, kind });
const isActive = (game: Game | null): game is Game => !!game && game.phase !== "ended";
/** Live/final public world state of one game. No scores, seeds, sources or end deadline. */
export function publicGame(game: Game) {
  return {
    id: game.id, shortCode: game.shortCode, phase: game.phase, worldSeconds: game.worldSeconds,
    planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt, agentCount: game.agents.length,
    leaderboard: standings(game),
    objects: game.objects.map(o => ({ id: o.id, value: o.value, version: o.version, salience: o.scores ? salience(netMap(o)) : 0 })),
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    recoveryReason: game.recoveryReason ?? null,
    settings: game.settings, roster: game.roster.map(rosterEntry),
    scoring: isLegacy(game) ? null : SCORING,
    objectInstance: objectInstance(game.settings),
  };
}
/** Public result of an ended game, as stored in cg_games.summary for the room's history. */
export function gameRecord(roomId: string, game: Game) {
  const leaderboard = standings(game);
  return {
    id: game.id, shortCode: game.shortCode, roomId,
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    settings: game.settings, roster: game.roster.map(rosterEntry), leaderboard,
    // A retired legacy game has no meaningful result.
    winners: isLegacy(game) ? [] : leaderboard.filter(row => row.rank === 1).map(({ deityId, name, kind }) => ({ deityId, name, kind })),
    worldSeconds: game.worldSeconds, objectCount: game.objects.length, agentCount: game.agents.length,
    ...(isLegacy(game) ? {} : { scoring: SCORING }),
  };
}
export type GameRecord = ReturnType<typeof gameRecord>;
/** Room's pointer to its single active game; null in the lobby between games. */
export function activeGameRef(room: Room) {
  const game = room.game;
  return !isActive(game) ? null : {
    id: game.id, shortCode: game.shortCode, phase: game.phase, startedAt: game.createdAt, roster: game.roster.map(rosterEntry),
  };
}
/** Public chat sent while this game was being played. */
function gameChat(chat: Chat[], game: Game) {
  const end = game.endedAt ?? (game.phase === "ended" ? Infinity : Date.now());
  return chat.filter(m => m.timestamp >= game.createdAt && m.timestamp <= end).slice(-100);
}
/**
 * One game's page: its own world, standings and chat; `room` is null if the room is gone. A legacy
 * game shows the leaderboard of its stored summary, which was written under the old scoring.
 */
export function publicGameView(game: Game, room: Room | null, stored?: GameRecord | null) {
  const record = gameRecord(room?.id ?? "", game);
  const legacy = isLegacy(game) && stored ? stored : null;
  return {
    ...publicGame(game),
    ...(legacy ? { leaderboard: legacy.leaderboard } : {}),
    roomId: room?.id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
    status: game.phase === "ended" ? "ended" as const : "active" as const,
    winners: game.phase === "ended" ? (legacy ?? record).winners : [],
    chat: room ? gameChat(room.chat, game) : [],
    roomActiveGame: room ? activeGameRef(room) : null,
    utilityCatalog: catalogFor(game.settings),
    serverTime: Date.now(),
  };
}
export function publicRoom(room: Room) {
  const game = room.game;
  return {
    id: room.id, shortCode: room.shortCode, ownerId: room.ownerId,
    ownerName: room.members.find(m => m.id === room.ownerId)?.name ?? room.ownerId, createdAt: room.createdAt,
    revision: room.revision, settings: room.settings,
    members: room.members.map(({ aiAgent, ...member }) => ({
      ...member, ...(aiAgent ? { aiAgentId: aiAgent.id, aiAgentRevision: aiAgent.revision, provider: aiAgent.provider, model: aiAgent.model } : {}),
    })), chat: room.chat.slice(-100),
    aiBudget: room.aiBudget, aiUsed: room.aiUsed, serverTime: Date.now(),
    aiInputTokens: room.aiInputTokens ?? 0, aiOutputTokens: room.aiOutputTokens ?? 0,
    // The lobby describes the NEXT game: its object type, and the families its gods might draw, never who drew which.
    objectInstance: objectInstance(room.settings),
    utilityCatalog: catalogFor(room.settings),
    activeGame: activeGameRef(room),
    /** Legacy room-scoped view of the current game slot; new clients use activeGame and /games/{code}/state. */
    game: !game ? null : publicGame(game),
  };
}
/** The room as one god sees it (player-scoped sockets): its own card, energy, agents and object scores. */
export function personalRoom(room: Room, id: string) {
  const publicState = publicRoom(room), game = room.game;
  const deity = game?.deities.find(d => d.id === id);
  if (!game || !deity) return { ...publicState, self: null };
  return {
    ...publicState,
    self: {
      deityId: id, utility: utilityCard(game, id), energy: godEnergy(game, deity),
      pauseUsed: deity.pauseUsed, agents: game.agents.filter(a => a.ownerId === id).map(a => agentView(game, a)),
    },
    game: {
      ...publicState.game!,
      objects: game.objects.map(o => {
        const personal = personalObject(game, o, id);
        return { id: o.id, value: o.value, version: o.version, salience: o.scores ? salience(netMap(o)) : 0, ...(personal ?? {}) };
      }),
    },
  };
}
