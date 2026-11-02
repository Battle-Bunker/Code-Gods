/**
 * The app's URL scheme (src/core/routes.ts, docs/unify-apps-plan.md §1.2) under the app's own base path ("/" when the
 * engine serves it or on a dev server, anything behind a proxy): the base is never assumed, every page round-trips,
 * and anything else is not found (no legacy aliases: /client/…, /games/:code, ?room=, rooms/:room/games).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { carriedSearch, parseRoute, routeHref, type AppRoute } from "../src/core/routes.ts";

const PAGES: Exclude<AppRoute, { kind: "notFound" }>[] = [
  { kind: "home" }, { kind: "room", room: "ABCD" }, { kind: "configure", room: "ABCD" }, { kind: "game", room: "ABCD", game: "G9TQ" },
  { kind: "connect" }, { kind: "device" }, { kind: "admin" }, { kind: "admin", agent: "a1" },
];

test("every page round-trips under any base path", () => {
  for (const base of ["/", "/some/proxy/"]) {
    for (const route of PAGES) assert.deepEqual(parseRoute(base, routeHref(base, route)), route, `${base} ${route.kind}`);
    assert.equal(routeHref(base, { kind: "game", room: "ABCD", game: "G9TQ" }), `${base}rooms/ABCD/games/G9TQ`);
  }
  assert.deepEqual(parseRoute("/some/proxy/", "/some/proxy"), { kind: "home" }, "the base without its trailing slash");
  assert.deepEqual(parseRoute("/", "/rooms/ABCD/"), { kind: "room", room: "ABCD" }, "a trailing slash");
  assert.equal(routeHref("/", { kind: "game", room: "A/B", game: "C D" }), "/rooms/A%2FB/games/C%20D");
  assert.deepEqual(parseRoute("/", "/rooms/A%2FB/games/C%20D"), { kind: "game", room: "A/B", game: "C D" });
});

test("no legacy aliases: old and stray paths are not found", () => {
  // Catches: a compatibility route sneaking back (the owner, 2026-11-02: no backwards compatibility).
  for (const path of ["/client/", "/client/rooms/ABCD", "/player/", "/games/G9TQ", "/rooms/ABCD/games", "/rooms", "/rooms/ABCD/games/G9TQ/x", "/admin", "/nope"]) {
    assert.deepEqual(parseRoute("/", path), { kind: "notFound" }, path);
  }
  assert.deepEqual(parseRoute("/app/", "/rooms/ABCD"), { kind: "notFound" }, "outside the base");
});

test("navigation carries the page's own parameters, never a replay's position", () => {
  assert.equal(carriedSearch("?panels=off&e=12&t=3&speed=2&play=1&as=u1"), "?panels=off");
  assert.equal(carriedSearch("?e=1"), "");
});
