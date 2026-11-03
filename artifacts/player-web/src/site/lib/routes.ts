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
/** The rule gallery and one family's page; `search` is the query string (site/lib/rule-gallery.ts gallerySearch). */
export const ruleGalleryPath = (search = "") => routeHref("/", { kind: "ruleGallery" }, search);
export const ruleFamilyPath = (family: string, search = "") => routeHref("/", { kind: "ruleFamily", family }, search);

/**
 * Whether the viewer may open a finished game of the room's history (newest first, `index` in it): the gods who played
 * in it or watched it and the room owner, as the engine enforces (convex/lib/rooms requireHistoricReaderAs); between games the newest
 * is still the room's current game, open to every member.
 */
export function canOpenGame(game: { roster: readonly { id: string }[]; spectators?: readonly string[] }, index: number, viewer: { meId?: string; ownerId?: string; roomLive: boolean }) {
  if (index === 0 && !viewer.roomLive) return true;
  return !!viewer.meId && (viewer.meId === viewer.ownerId || game.roster.some(m => m.id === viewer.meId) || !!game.spectators?.includes(viewer.meId));
}

/** What the signed-out visitor opened, in words: an invite link names its room (and game). */
export function invitedTo(path: string): string | null {
  const m = /^\/rooms\/([^/?#]+)(?:\/games\/([^/?#]+))?/.exec(path);
  if (!m) return null;
  const room = decodeURIComponent(m[1]).toUpperCase();
  return m[2] ? `Sign in to watch or play game ${decodeURIComponent(m[2]).toUpperCase()} in room ${room}.` : `Sign in to open room ${room}.`;
}
