import { leaderboard, personalScore, totalUtility } from "@workspace/game-core";
import { card, publicCatalog } from "@workspace/game-utilities";
import type { Room, Game, Chat } from "./types";
export function standings(game: Game) {
  return leaderboard(game.roster.map(m => m.id), game.objects.map(o => new Map(Object.entries(o.utilities))))
    .map(row => ({ ...row, name: game.roster.find(m => m.id === row.deityId)!.name, kind: game.roster.find(m => m.id === row.deityId)!.kind }));
}
/** A god's own utility function: plain-language incentives first, then source in the game's language. */
export function utilityCard(game: Game, id: string) {
  const deity = game.deities.find(d => d.id === id);
  if (!deity) return null;
  const { name, summary, source } = card(deity.utility);
  return { name, summary, language: game.settings.language, source: source[game.settings.language] };
}
const rosterEntry = ({ id, name, kind }: Game["roster"][number]) => ({ id, name, kind });
const isActive = (game: Game | null): game is Game => !!game && game.phase !== "ended";
/** Live/final public world state of one game. No utilities, seeds, sources or end deadline. */
export function publicGame(game: Game) {
  return {
    id: game.id, shortCode: game.shortCode, phase: game.phase, worldSeconds: game.worldSeconds,
    planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt, agentCount: game.agents.length,
    leaderboard: standings(game),
    objects: game.objects.map(o => ({ id: o.id, value: o.value, version: o.version, totalUtility: totalUtility(new Map(Object.entries(o.utilities))) })),
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    recoveryReason: game.recoveryReason ?? null,
    settings: game.settings, roster: game.roster.map(rosterEntry),
  };
}
/** Public result of an ended game, as stored in cg_games.summary for the room's history. */
export function gameRecord(roomId: string, game: Game) {
  const leaderboard = standings(game);
  return {
    id: game.id, shortCode: game.shortCode, roomId,
    startedAt: game.createdAt, endedAt: game.endedAt ?? null, endReason: game.endReason ?? null,
    settings: game.settings, roster: game.roster.map(rosterEntry), leaderboard,
    winners: leaderboard.filter(row => row.rank === 1).map(({ deityId, name, kind }) => ({ deityId, name, kind })),
    worldSeconds: game.worldSeconds, objectCount: game.objects.length, agentCount: game.agents.length,
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
/** One game's page: its own world, standings and chat; `room` is null if the room is gone. */
export function publicGameView(game: Game, room: Room | null) {
  const record = gameRecord(room?.id ?? "", game);
  return {
    ...publicGame(game),
    roomId: room?.id ?? null, roomShortCode: room?.shortCode ?? null, ownerId: room?.ownerId ?? null,
    status: game.phase === "ended" ? "ended" as const : "active" as const,
    winners: game.phase === "ended" ? record.winners : [],
    chat: room ? gameChat(room.chat, game) : [],
    roomActiveGame: room ? activeGameRef(room) : null,
    utilityCatalog: publicCatalog(game.settings.objectType),
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
    // The lobby describes the NEXT game: the families its gods might draw, never who drew which.
    utilityCatalog: publicCatalog(room.settings.objectType),
    activeGame: activeGameRef(room),
    /** Legacy room-scoped view of the current game slot; new clients use activeGame and /games/{code}/state. */
    game: !game ? null : publicGame(game),
  };
}
export function personalRoom(room: Room, id: string) {
  const publicState = publicRoom(room), game = room.game;
  const deity = game?.deities.find(d => d.id === id);
  if (!game || !deity) return { ...publicState, self: null };
  return {
    ...publicState,
    self: {
      deityId: id, utility: utilityCard(game, id),
      energy: game.settings.startingEnergy + Math.max(0, Date.now() - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent,
      pauseUsed: deity.pauseUsed, agents: game.agents.filter(a => a.ownerId === id),
    },
    game: {
      ...publicState.game,
      objects: game.objects.map(o => ({ id: o.id, value: o.value, version: o.version, ...personalScore(new Map(Object.entries(o.utilities)), id) })),
    },
  };
}
