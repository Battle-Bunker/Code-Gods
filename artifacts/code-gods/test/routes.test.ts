/**
 * The engine UI's URL scheme (src/lib/routes.ts): rooms contain games (/rooms/:room/games/:game); the old /games/:code
 * and /rooms/:room?game=CODE links map to it; the player client lives at /client/ with the same scheme.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { canOpenGame, configurePath, gamePath, legacyGameCode, playerClientPath, roomPath } from "../src/lib/routes.ts";

test("paths nest games in their room and encode every segment", () => {
  assert.equal(roomPath("ABCD"), "/rooms/ABCD");
  assert.equal(gamePath("ABCD", "G9TQ"), "/rooms/ABCD/games/G9TQ");
  assert.equal(configurePath("ABCD"), "/rooms/ABCD/configure");
  assert.equal(configurePath("ABCD", "set up/1"), "/rooms/ABCD/configure?setup=set%20up%2F1");
  assert.equal(gamePath("A/B", "C D"), "/rooms/A%2FB/games/C%20D");
});

test("the player client mirrors the scheme under /client/", () => {
  assert.equal(playerClientPath("ABCD"), "/client/rooms/ABCD");
  assert.equal(playerClientPath("ABCD", "G9TQ"), "/client/rooms/ABCD/games/G9TQ");
});

test("old game links are recognised for redirecting", () => {
  assert.equal(legacyGameCode("?game=G9TQ"), "G9TQ");
  assert.equal(legacyGameCode("?x=1&game=%20G9TQ%20"), "G9TQ");
  assert.equal(legacyGameCode("?game="), null);
  assert.equal(legacyGameCode(""), null);
});

test("a past game is linked for its players and the room owner; between games the newest is still the room's, for all", () => {
  const g = (roster: string[]) => ({ roster: roster.map(id => ({ id })) });
  const viewer = { meId: "b", ownerId: "a", roomLive: true };
  assert.equal(canOpenGame(g(["b", "c"]), 3, viewer), true, "played in it");
  assert.equal(canOpenGame(g(["c"]), 3, viewer), false, "did not play");
  assert.equal(canOpenGame(g(["c"]), 3, { ...viewer, meId: "a" }), true, "the owner");
  assert.equal(canOpenGame(g(["c"]), 0, viewer), false, "the newest while another game runs");
  assert.equal(canOpenGame(g(["c"]), 0, { ...viewer, roomLive: false }), true, "the newest between games is the room's current game");
  assert.equal(canOpenGame(g(["c"]), 3, { ...viewer, meId: undefined }), false);
});
