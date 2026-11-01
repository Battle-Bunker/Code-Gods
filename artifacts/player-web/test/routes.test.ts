/**
 * The player client's URL scheme (src/core/routes.ts), mirroring the engine UI's under the app's own base path
 * ("/client/" when the engine hosts it, "/" on a dev server): the base is never assumed, legacy links (?room=CODE,
 * /games/CODE) and stray paths canonicalise, and hrefs round-trip.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHref } from "../src/core/routes.ts";

test("routes parse under any base path", () => {
  for (const base of ["/client/", "/", "/some/proxy/"]) {
    assert.deepEqual(parseRoute(base, base, ""), { route: { kind: "home" } }, base);
    assert.deepEqual(parseRoute(base, `${base}rooms/ABCD`, ""), { route: { kind: "room", room: "ABCD" } }, base);
    assert.deepEqual(parseRoute(base, `${base}rooms/ABCD/`, ""), { route: { kind: "room", room: "ABCD" } }, base);
    assert.deepEqual(parseRoute(base, `${base}rooms/ABCD/games`, ""), { route: { kind: "games", room: "ABCD" } }, base);
    assert.deepEqual(parseRoute(base, `${base}rooms/ABCD/games/G9TQ`, ""), { route: { kind: "game", room: "ABCD", game: "G9TQ" } }, base);
  }
  // The base without its trailing slash is the home page.
  assert.deepEqual(parseRoute("/client/", "/client", ""), { route: { kind: "home" } });
  // Path segments are URL-decoded.
  assert.deepEqual(parseRoute("/", "/rooms/AB%20CD", "").route, { kind: "room", room: "AB CD" });
});

test("legacy and stray paths canonicalise, keeping unrelated query parameters", () => {
  assert.deepEqual(parseRoute("/client/", "/client/", "?room=ABCD"), { route: { kind: "room", room: "ABCD" }, canonical: "/client/rooms/ABCD" });
  assert.deepEqual(parseRoute("/client/", "/client/", "?room=ABCD&panels=off"), { route: { kind: "room", room: "ABCD" }, canonical: "/client/rooms/ABCD?panels=off" });
  assert.deepEqual(parseRoute("/", "/", "?room=%20"), { route: { kind: "home" }, canonical: "/" }, "a blank ?room is dropped");
  // The engine UI's old game links, and its configure page (no player-side equivalent: the room).
  assert.deepEqual(parseRoute("/client/", "/client/games/G9TQ", ""), { route: { kind: "legacyGame", game: "G9TQ" } });
  assert.deepEqual(parseRoute("/client/", "/client/rooms/ABCD/configure", "?panels=off"), { route: { kind: "room", room: "ABCD" }, canonical: "/client/rooms/ABCD?panels=off" });
  assert.deepEqual(parseRoute("/client/", "/client/rooms/ABCD/games/G9TQ/more", ""), { route: { kind: "room", room: "ABCD" }, canonical: "/client/rooms/ABCD" });
  assert.deepEqual(parseRoute("/client/", "/client/nowhere/at/all", ""), { route: { kind: "home" }, canonical: "/client/" });
  // A path outside the base (a misconfigured proxy) is the home page, canonicalised under the base.
  assert.deepEqual(parseRoute("/client/", "/elsewhere", ""), { route: { kind: "home" }, canonical: "/client/" });
});

test("hrefs are built under the base and round-trip", () => {
  assert.equal(routeHref("/client/", { kind: "home" }), "/client/");
  assert.equal(routeHref("/client/", { kind: "room", room: "ABCD" }), "/client/rooms/ABCD");
  assert.equal(routeHref("/", { kind: "games", room: "ABCD" }), "/rooms/ABCD/games");
  assert.equal(routeHref("/", { kind: "game", room: "ABCD", game: "G9TQ" }), "/rooms/ABCD/games/G9TQ");
  assert.equal(routeHref("/client", { kind: "room", room: "ABCD" }), "/client/rooms/ABCD", "a base without its trailing slash");
  assert.equal(routeHref("/", { kind: "room", room: "A/B" }), "/rooms/A%2FB", "segments are encoded");
  for (const route of [{ kind: "home" }, { kind: "room", room: "ABCD" }, { kind: "games", room: "ABCD" }, { kind: "game", room: "ABCD", game: "G9TQ" }] as const) {
    assert.deepEqual(parseRoute("/client/", routeHref("/client/", route), "").route, route);
  }
});

test("engine UI links point at the engine's site, wherever the client runs (a dev server's origin is not the engine)", async () => {
  const { enginePageHref } = await import("../src/core/routes.ts");
  assert.equal(enginePageHref("https://dep.convex.site", { room: "AB12" }), "https://dep.convex.site/rooms/AB12");
  assert.equal(enginePageHref("https://dep.convex.site/", { room: "AB 12", game: "G9" }), "https://dep.convex.site/rooms/AB%2012/games/G9");
  assert.equal(enginePageHref(undefined, { room: "AB12" }), "/rooms/AB12", "unknown engine: this origin (the hosted client)");
});
