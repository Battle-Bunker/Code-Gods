/**
 * The room's past games as the player client lists them ({base}rooms/:room/games). The engine's room history
 * (rooms.history) has every finished game's public result; a past game opens read-only only for the gods who played in
 * it and the room owner (the engine enforces it: convex/lib/rooms requireHistoricReaderAs), so the others are listed
 * without a link.
 */
type Record = {
  id: string; shortCode: string; startedAt: number; endedAt: number | null; endReason: string | null;
  roster: readonly { id: string }[]; winners: readonly { name: string }[];
};

export type PastGame = { id: string; shortCode: string; startedAt: number; endedAt: number | null; endReason: string | null; winners: string; played: boolean; canOpen: boolean };

/**
 * `roomLive`: whether the room runs a game now. Without one, the newest finished game is still the room's current game
 * (shown until the next launch), which every member may open; every other one is a past game.
 */
export function pastGames(records: readonly (Record | null)[] | undefined, meId: string | undefined, ownerId: string | undefined, roomLive: boolean): PastGame[] {
  return (records ?? []).filter((r): r is Record => !!r).map((r, i) => {
    const played = !!meId && r.roster.some(m => m.id === meId);
    const current = i === 0 && !roomLive;
    return {
      id: r.id, shortCode: r.shortCode, startedAt: r.startedAt, endedAt: r.endedAt, endReason: r.endReason,
      winners: r.winners.map(w => w.name).join(", "), played, canOpen: current || played || (!!meId && meId === ownerId),
    };
  });
}

/** A timestamp for the history pages, or a dash. */
export const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "—");
