import { leaderboard, personalScore, totalValue } from "@workspace/game-core";
import type { Room, Game } from "./types";
export function standings(game: Game) {
  return leaderboard(game.roster.map(m => m.id), game.objects.map(o => new Map(Object.entries(o.values))))
    .map(row => ({ ...row, name: game.roster.find(m => m.id === row.deityId)!.name, kind: game.roster.find(m => m.id === row.deityId)!.kind }));
}
export function publicRoom(room: Room) {
  const game = room.game;
  return {
    id: room.id, shortCode: room.shortCode, ownerId: room.ownerId,
    revision: room.revision, settings: room.settings,
    members: room.members.map(({ aiAgent, ...member }) => ({
      ...member, ...(aiAgent ? { aiAgentId: aiAgent.id, aiAgentRevision: aiAgent.revision, provider: aiAgent.provider, model: aiAgent.model } : {}),
    })), chat: room.chat.slice(-100),
    aiBudget: room.aiBudget, aiUsed: room.aiUsed, serverTime: Date.now(),
    game: !game ? null : {
      id: game.id, shortCode: game.shortCode, phase: game.phase, worldSeconds: game.worldSeconds,
      planningEndsAt: game.planningEndsAt, pauseEndsAt: game.pauseEndsAt, agentCount: game.agents.length,
      leaderboard: standings(game),
      objects: game.objects.map(o => ({ id: o.id, value: o.value, version: o.version, totalValueSum: totalValue(new Map(Object.entries(o.values))) })),
    },
  };
}
export function personalRoom(room: Room, id: string) {
  const publicState = publicRoom(room), game = room.game;
  const deity = game?.deities.find(d => d.id === id);
  if (!game || !deity) return { ...publicState, self: null };
  return {
    ...publicState,
    self: {
      deityId: id, valueSource: deity.source,
      energy: game.settings.startingEnergy + Math.max(0, Date.now() - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent,
      pauseUsed: deity.pauseUsed, agents: game.agents.filter(a => a.ownerId === id),
    },
    game: {
      ...publicState.game,
      objects: game.objects.map(o => ({ id: o.id, value: o.value, version: o.version, ...personalScore(new Map(Object.entries(o.values)), id) })),
    },
  };
}
