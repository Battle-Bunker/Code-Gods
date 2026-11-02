/**
 * Page paths relative to the app's router base (core/app.tsx; core/routes.ts has the full scheme). Rooms contain games:
 *
 *   /rooms/:room                    the room (never a game)
 *   /rooms/:room/configure          the next game's setup
 *   /rooms/:room/games/:game        one game: player view, spectator view or replay (pages/game.tsx)
 *
 * Codes are the rooms' and games' short codes, as everywhere in the UI.
 */
import { routeHref } from "../../core/routes.ts";

export const roomPath = (room: string) => routeHref("/", { kind: "room", room });
export const configurePath = (room: string, setup?: string) => routeHref("/", { kind: "configure", room }, setup ? `?setup=${encodeURIComponent(setup)}` : "");
export const gamePath = (room: string, game: string) => routeHref("/", { kind: "game", room, game });

/**
 * Whether the viewer may open a finished game of the room's history (newest first, `index` in it): the gods who played
 * in it or watched it and the room owner, as the engine enforces (convex/lib/rooms requireHistoricReaderAs); between games the newest
 * is still the room's current game, open to every member.
 */
export function canOpenGame(game: { roster: readonly { id: string }[]; spectators?: readonly string[] }, index: number, viewer: { meId?: string; ownerId?: string; roomLive: boolean }) {
  if (index === 0 && !viewer.roomLive) return true;
  return !!viewer.meId && (viewer.meId === viewer.ownerId || game.roster.some(m => m.id === viewer.meId) || !!game.spectators?.includes(viewer.meId));
}
