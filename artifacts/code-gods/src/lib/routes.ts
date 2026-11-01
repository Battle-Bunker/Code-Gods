/**
 * The engine UI's URL scheme. Rooms contain games:
 *
 *   /rooms/:room                    the room: its current or next game, members, past games
 *   /rooms/:room/configure          the next game's setup (owner)
 *   /rooms/:room/games/:game        one game of the room, live or ended
 *
 * Old links redirect: /games/:code (pages/game.tsx, once it knows the game's room) and /rooms/:room?game=CODE. Codes
 * are the rooms' and games' short codes, as everywhere in the UI. The player client (artifacts/player-web), hosted by
 * the engine at /client/, mirrors the scheme under that prefix (its own src/core/routes.ts).
 */
const seg = encodeURIComponent;

export const roomPath = (room: string) => `/rooms/${seg(room)}`;
export const configurePath = (room: string, setup?: string) => `/rooms/${seg(room)}/configure${setup ? `?setup=${seg(setup)}` : ""}`;
export const gamePath = (room: string, game: string) => `/rooms/${seg(room)}/games/${seg(game)}`;

/** The hosted player client's page for a room (or one of its games), on this same site. */
export const PLAYER_CLIENT_BASE = "/client/";
export const playerClientPath = (room: string, game?: string) => `${PLAYER_CLIENT_BASE}rooms/${seg(room)}${game ? `/games/${seg(game)}` : ""}`;

/** The game code of an old /rooms/:room?game=CODE link, or null. */
export function legacyGameCode(search: string): string | null {
  return new URLSearchParams(search).get("game")?.trim() || null;
}

/**
 * Whether the viewer may open a finished game of the room's history (newest first, `index` in it): the gods who played
 * in it and the room owner, as the engine enforces (convex/lib/rooms requireHistoricReaderAs); between games the newest
 * is still the room's current game, open to every member.
 */
export function canOpenGame(game: { roster: readonly { id: string }[] }, index: number, viewer: { meId?: string; ownerId?: string; roomLive: boolean }) {
  if (index === 0 && !viewer.roomLive) return true;
  return !!viewer.meId && (viewer.meId === viewer.ownerId || game.roster.some(m => m.id === viewer.meId));
}
