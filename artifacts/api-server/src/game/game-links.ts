import { encodeUuid, resolveIdentifier } from "@workspace/game-core";

export interface ArchivedGameLink {
  id: string;
  room_id: string;
  prefix_length: number;
}

interface LinkRoom {
  id: string;
  shortCode: string;
  game?: { id: string } | null;
}

/** Archive metadata only: never expose private agents or replay an old game as the current one. */
export function resolveGameLink(code: string, games: ArchivedGameLink[], rooms: LinkRoom[], actor: { scope: string; roomId?: string }) {
  let id: string;
  try { id = resolveIdentifier(code, games.map(game => game.id)); }
  catch (error) { throw Object.assign(error as Error, { status: 404 }); }
  const game = games.find(candidate => candidate.id === id)!;
  if (actor.scope !== "browser" && actor.roomId !== game.room_id) {
    throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  }
  const room = rooms.find(candidate => candidate.id === game.room_id);
  return {
    id,
    shortCode: encodeUuid(id).slice(0, game.prefix_length),
    roomShortCode: room?.shortCode ?? null,
    status: !room ? "unavailable" as const : room.game?.id === id ? "current" as const : "historical" as const,
  };
}
