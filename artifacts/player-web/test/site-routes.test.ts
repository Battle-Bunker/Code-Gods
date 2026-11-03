/**
 * The pages' paths (src/site/lib/routes.ts): rooms contain games (/rooms/:room/games/:game), and who may open a past
 * game from the room's history.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { canOpenGame, configurePath, gamePath, invitedTo, roomPath } from "../src/site/lib/routes.ts";

test("paths nest games in their room and encode every segment", () => {
  assert.equal(roomPath("ABCD"), "/rooms/ABCD");
  assert.equal(gamePath("ABCD", "G9TQ"), "/rooms/ABCD/games/G9TQ");
  assert.equal(configurePath("ABCD"), "/rooms/ABCD/configure");
  assert.equal(configurePath("ABCD", "set up/1"), "/rooms/ABCD/configure?setup=set%20up%2F1");
  assert.equal(gamePath("A/B", "C D"), "/rooms/A%2FB/games/C%20D");
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
  assert.equal(canOpenGame({ ...g(["c"]), spectators: ["b"] }, 3, viewer), true, "watched it");
});

test("the sign-in screen names what an invite link opens: its room, or its game in its room", () => {
  assert.equal(invitedTo("/rooms/abcd"), "Sign in to open room ABCD.");
  assert.equal(invitedTo("/rooms/ABCD/configure"), "Sign in to open room ABCD.");
  assert.equal(invitedTo("/rooms/ABCD/games/g9tq"), "Sign in to watch or play game G9TQ in room ABCD.");
  assert.equal(invitedTo("/"), null);
  assert.equal(invitedTo("/device"), null);
});
