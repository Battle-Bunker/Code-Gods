/**
 * The app's URL scheme (archive/engine-v1:docs/unify-apps-plan.md §1.2), under the app's own base path (Vite's `base`: "/" when the
 * engine serves it and on a player's dev server, anything else behind a proxy). Nothing here assumes a fixed prefix.
 *
 *   {base}                               your rooms
 *   {base}rooms/:room                    the room (never a game)
 *   {base}rooms/:room/configure          the next game's setup
 *   {base}rooms/:room/games/:game        one game: player view, spectator view, or replay once it has ended
 *   {base}connect, {base}device          approving an app or a device
 *   {base}admin/agents[/:id]             the AI player library
 *   {base}rule-gallery                   the rule gallery: every annotated rule family for a board (setup in GET params)
 *   {base}rule-gallery/:family           one rule family's page (board and params in GET params)
 *
 * Any other path is not found. The pages under site/ build their paths with site/lib/routes.ts, from routeHref.
 */
export type AppRoute =
  | { kind: "home" }
  | { kind: "room"; room: string }
  | { kind: "configure"; room: string }
  | { kind: "game"; room: string; game: string }
  | { kind: "connect" }
  | { kind: "device" }
  | { kind: "admin"; agent?: string }
  | { kind: "ruleGallery" }
  | { kind: "ruleFamily"; family: string }
  | { kind: "notFound" };

const withSlash = (base: string) => (base.endsWith("/") ? base : `${base}/`);
const seg = encodeURIComponent;

/** The href of a route under `base` (with an optional query string, "?…" or ""). */
export function routeHref(base: string, route: Exclude<AppRoute, { kind: "notFound" }>, search = ""): string {
  const path = route.kind === "home" ? ""
    : route.kind === "room" ? `rooms/${seg(route.room)}`
    : route.kind === "configure" ? `rooms/${seg(route.room)}/configure`
    : route.kind === "game" ? `rooms/${seg(route.room)}/games/${seg(route.game)}`
    : route.kind === "admin" ? `admin/agents${route.agent ? `/${seg(route.agent)}` : ""}`
    : route.kind === "ruleGallery" ? "rule-gallery"
    : route.kind === "ruleFamily" ? `rule-gallery/${seg(route.family)}`
    : route.kind;
  return `${withSlash(base)}${path}${search}`;
}

/**
 * The router's patterns (wouter, core/app.tsx), one per page; any other path is the not-found page. Relative to the
 * router's base, in wouter's syntax (regexparam).
 */
export const ROUTE_PATTERNS = {
  home: "/",
  configure: "/rooms/:id/configure",
  game: "/rooms/:roomId/games/:gameId",
  room: "/rooms/:id",
  device: "/device",
  connect: "/connect",
  admin: "/admin/agents",
  adminAgent: "/admin/agents/:id",
  ruleGallery: "/rule-gallery",
  ruleFamily: "/rule-gallery/:family",
} as const;

/** A replay's position parameters (src/core/replay/model.ts): they belong to one game's page, never carried elsewhere. */
const PAGE_PARAMS = ["e", "t", "speed", "play", "as"];
/** The query string carried across navigation: the page's own parameters (?panels=off), without a replay's position. */
export function carriedSearch(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of PAGE_PARAMS) q.delete(k);
  return q.size ? `?${q}` : "";
}
