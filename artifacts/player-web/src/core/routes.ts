/**
 * The player client's URL scheme. It mirrors the engine UI's (artifacts/code-gods/src/lib/routes.ts) under the app's
 * own base path, which is whatever Vite's `base` is: "/client/" when the engine hosts the app, "/" on a player's dev
 * server (Replit, Codespaces, a laptop), anything else behind a proxy. Nothing here assumes a fixed prefix.
 *
 *   {base}                               your rooms (hosted) or the credential's room (dev server)
 *   {base}rooms/:room                    the room: its current or next game
 *   {base}rooms/:room/games              the room's past games (the ones you can open: you played in them, or own the room)
 *   {base}rooms/:room/games/:game        one game of the room: the current one redirects to the room (played there),
 *                                        a past one opens read-only
 *
 * Legacy links canonicalise: {base}?room=CODE (the old hosted invite link), {base}rooms/:room/configure (the engine
 * UI's page; the client has no equivalent) and stray paths. {base}games/:game (the engine UI's old game link) needs
 * the engine to find the game's room, so it parses as `legacyGame` and the app redirects once it knows.
 */
export type ClientRoute =
  | { kind: "home" }
  | { kind: "room"; room: string }
  | { kind: "games"; room: string }
  | { kind: "game"; room: string; game: string }
  | { kind: "legacyGame"; game: string };

/** A parsed location; `canonical` is the href to replace it with, when it is not already canonical. */
export type ParsedRoute = { route: ClientRoute; canonical?: string };

const withSlash = (base: string) => (base.endsWith("/") ? base : `${base}/`);
const decode = (segment: string) => { try { return decodeURIComponent(segment); } catch { return segment; } };

/** The href of a route under `base` (with an optional query string, "?…" or ""). */
export function routeHref(base: string, route: Exclude<ClientRoute, { kind: "legacyGame" }>, search = ""): string {
  const root = withSlash(base);
  const path = route.kind === "home" ? "" : route.kind === "room" ? `rooms/${encodeURIComponent(route.room)}`
    : route.kind === "games" ? `rooms/${encodeURIComponent(route.room)}/games`
    : `rooms/${encodeURIComponent(route.room)}/games/${encodeURIComponent(route.game)}`;
  return `${root}${path}${search}`;
}

export function parseRoute(base: string, pathname: string, search: string): ParsedRoute {
  const root = withSlash(base);
  const params = new URLSearchParams(search);
  const rest = () => (params.size ? `?${params}` : "");
  const to = (route: Exclude<ClientRoute, { kind: "legacyGame" }>) => ({ route, canonical: routeHref(root, route, rest()) });
  const inside = pathname.startsWith(root) || `${pathname}/` === root;
  if (!inside) return to({ kind: "home" });
  const segments = pathname.slice(root.length).split("/").filter(Boolean).map(decode);

  if (segments.length === 0) {
    if (!params.has("room")) return { route: { kind: "home" } };
    const room = params.get("room")!.trim();
    params.delete("room");
    return to(room ? { kind: "room", room } : { kind: "home" });
  }
  const [first, room, third, game, ...extra] = segments;
  if (first === "games" && room && !third) return { route: { kind: "legacyGame", game: room } };
  if (first !== "rooms" || !room) return to({ kind: "home" });
  if (!third) return { route: { kind: "room", room } };
  if (third === "games" && !game) return { route: { kind: "games", room } };
  if (third === "games" && extra.length === 0) return { route: { kind: "game", room, game } };
  return to({ kind: "room", room });
}

/**
 * A page of the engine UI (artifacts/code-gods/src/lib/routes.ts): on the engine's own site, which is another origin
 * when the client runs on a dev server or any other host (`site` from the dev server's token endpoint or the hosted
 * connection; connection.ts engineSite). Without one, this origin (the hosted client on the engine).
 */
export function enginePageHref(site: string | undefined, page: { room: string; game?: string }): string {
  const root = site ? site.replace(/\/+$/, "") : "";
  const room = `/rooms/${encodeURIComponent(page.room)}`;
  return `${root}${room}${page.game ? `/games/${encodeURIComponent(page.game)}` : ""}`;
}

/** A replay's position parameters (src/core/replay/model.ts): they belong to one game's page, never carried elsewhere. */
const PAGE_PARAMS = ["e", "t", "speed", "play", "as"];
/** The query string carried across navigation: the page's own parameters (?panels=off), without a replay's position. */
export function carriedSearch(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of PAGE_PARAMS) q.delete(k);
  return q.size ? `?${q}` : "";
}
