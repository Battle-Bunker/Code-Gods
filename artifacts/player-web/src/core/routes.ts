/**
 * The app's URL scheme (docs/unify-apps-plan.md §1.2), under the app's own base path (Vite's `base`: "/" when the
 * engine serves it and on a player's dev server, anything else behind a proxy). Nothing here assumes a fixed prefix.
 *
 *   {base}                               your rooms
 *   {base}rooms/:room                    the room (never a game)
 *   {base}rooms/:room/configure          the next game's setup
 *   {base}rooms/:room/games/:game        one game: player view, spectator view, or replay once it has ended
 *   {base}connect, {base}device          approving an app or a device
 *   {base}admin/agents[/:id]             the AI player library
 *
 * Any other path is not found. The pages under site/ build the same paths with site/lib/routes.ts (relative to the
 * router's base); this module serves the dock and the replay, which navigate by route.
 */
export type AppRoute =
  | { kind: "home" }
  | { kind: "room"; room: string }
  | { kind: "configure"; room: string }
  | { kind: "game"; room: string; game: string }
  | { kind: "connect" }
  | { kind: "device" }
  | { kind: "admin"; agent?: string }
  | { kind: "notFound" };

const withSlash = (base: string) => (base.endsWith("/") ? base : `${base}/`);
const decode = (segment: string) => { try { return decodeURIComponent(segment); } catch { return segment; } };
const seg = encodeURIComponent;

/** The href of a route under `base` (with an optional query string, "?…" or ""). */
export function routeHref(base: string, route: Exclude<AppRoute, { kind: "notFound" }>, search = ""): string {
  const path = route.kind === "home" ? ""
    : route.kind === "room" ? `rooms/${seg(route.room)}`
    : route.kind === "configure" ? `rooms/${seg(route.room)}/configure`
    : route.kind === "game" ? `rooms/${seg(route.room)}/games/${seg(route.game)}`
    : route.kind === "admin" ? `admin/agents${route.agent ? `/${seg(route.agent)}` : ""}`
    : route.kind;
  return `${withSlash(base)}${path}${search}`;
}

export function parseRoute(base: string, pathname: string): AppRoute {
  const root = withSlash(base);
  if (!(pathname.startsWith(root) || `${pathname}/` === root)) return { kind: "notFound" };
  const s = pathname.slice(root.length).split("/").filter(Boolean).map(decode);
  if (s.length === 0) return { kind: "home" };
  if (s[0] === "rooms" && s[1]) {
    if (s.length === 2) return { kind: "room", room: s[1] };
    if (s.length === 3 && s[2] === "configure") return { kind: "configure", room: s[1] };
    if (s.length === 4 && s[2] === "games" && s[3]) return { kind: "game", room: s[1], game: s[3] };
  }
  if (s.length === 1 && (s[0] === "connect" || s[0] === "device")) return { kind: s[0] };
  if (s[0] === "admin" && s[1] === "agents" && s.length <= 3) return { kind: "admin", ...(s[2] ? { agent: s[2] } : {}) };
  return { kind: "notFound" };
}

/** A replay's position parameters (src/core/replay/model.ts): they belong to one game's page, never carried elsewhere. */
const PAGE_PARAMS = ["e", "t", "speed", "play", "as"];
/** The query string carried across navigation: the page's own parameters (?panels=off), without a replay's position. */
export function carriedSearch(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of PAGE_PARAMS) q.delete(k);
  return q.size ? `?${q}` : "";
}
