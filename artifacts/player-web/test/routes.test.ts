/**
 * The app's URL scheme (src/core/routes.ts, docs/unify-apps-plan.md §1.2), checked against the router's own patterns
 * with wouter's own matcher: every page's href reaches exactly its page under any base path, and anything else is not
 * found (no legacy aliases: /client/…, /games/:code, ?room=, rooms/:room/games).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { matchRoute } from "wouter";
import { parse } from "regexparam";
import { ROUTE_PATTERNS, carriedSearch, routeHref, type AppRoute } from "../src/core/routes.ts";

type Page = keyof typeof ROUTE_PATTERNS;
/** The pages whose pattern matches `path` (relative to the router's base), with their params. */
const routed = (path: string) => (Object.keys(ROUTE_PATTERNS) as Page[])
  .map(page => [page, matchRoute(parse as never, ROUTE_PATTERNS[page], path)] as const)
  .filter(([, [hit]]) => hit).map(([page, [, params]]) => ({ page, params: Object.fromEntries(Object.entries(params ?? {}).filter(([k]) => !/^\d+$/.test(k))) }));
/** wouter strips the base (core/app.tsx's Router) before matching: the same here. */
const underBase = (base: string, href: string) => { assert.ok(href.startsWith(base), href); return `/${href.slice(base.length)}`; };

const PAGES: [Exclude<AppRoute, { kind: "notFound" }>, Page, Record<string, string>][] = [
  [{ kind: "home" }, "home", {}],
  [{ kind: "room", room: "ABCD" }, "room", { id: "ABCD" }],
  [{ kind: "configure", room: "ABCD" }, "configure", { id: "ABCD" }],
  [{ kind: "game", room: "ABCD", game: "G9TQ" }, "game", { roomId: "ABCD", gameId: "G9TQ" }],
  [{ kind: "connect" }, "connect", {}],
  [{ kind: "device" }, "device", {}],
  [{ kind: "admin" }, "admin", {}],
  [{ kind: "admin", agent: "a1" }, "adminAgent", { id: "a1" }],
  [{ kind: "ruleGallery" }, "ruleGallery", {}],
  [{ kind: "ruleFamily", family: "picture_frame" }, "ruleFamily", { family: "picture_frame" }],
];

test("every page's href reaches exactly its page, under any base path", () => {
  for (const base of ["/", "/some/proxy/"]) {
    for (const [route, page, params] of PAGES) {
      const hits = routed(underBase(base, routeHref(base, route)));
      // Catches: two patterns claiming one href (wouter's Switch would take the first), or an href no route serves.
      assert.deepEqual(hits.map(h => h.page), [page], `${base} ${route.kind}`);
      assert.deepEqual(hits[0]!.params, params);
    }
    assert.equal(routeHref(base, { kind: "game", room: "ABCD", game: "G9TQ" }), `${base}rooms/ABCD/games/G9TQ`);
  }
  assert.equal(routeHref("/", { kind: "game", room: "A/B", game: "C D" }), "/rooms/A%2FB/games/C%20D", "codes are one segment each");
});

test("no legacy aliases: old and stray paths are not found", () => {
  // Catches: a compatibility route sneaking back (the owner, 2026-11-02: no backwards compatibility).
  for (const path of ["/client/", "/client/rooms/ABCD", "/player/", "/games/G9TQ", "/rooms/ABCD/games", "/rooms", "/rooms/ABCD/games/G9TQ/x", "/admin", "/rule-gallery/a/b", "/nope"]) {
    assert.deepEqual(routed(path), [], path);
  }
});

test("navigation carries the page's own parameters, never a replay's position", () => {
  assert.equal(carriedSearch("?panels=off&e=12&t=3&speed=2&play=1&as=u1"), "?panels=off");
  assert.equal(carriedSearch("?e=1"), "");
});
