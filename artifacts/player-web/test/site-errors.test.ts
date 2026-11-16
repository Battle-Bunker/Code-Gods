import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { notFoundMsg } from "../src/site/lib/errors.ts";

test("a missing thing reads as the page's own guidance, not the engine's tool-facing message", () => {
  const notFound = new ConvexError({ code: "NOT_FOUND", message: "No such setup: list_setups names them all" });
  assert.equal(notFoundMsg(notFound, "Setup not found."), "Setup not found.");
  assert.equal(notFoundMsg(undefined, "Room not found."), "Room not found.");
});

test("any other failure keeps its own message", () => {
  assert.equal(notFoundMsg(new ConvexError({ code: "FORBIDDEN", message: "Members only" }), "Room not found."), "Members only");
});

test("a start that lost a race to its own game (CONFLICT: already a live game) counts as started; other errors do not", async () => {
  const { startRaced } = await import("../src/site/lib/errors.ts");
  const { ConvexError } = await import("convex/values");
  assert.equal(startRaced(new ConvexError({ code: "CONFLICT", message: "There is already a live game" })), true);
  assert.equal(startRaced(new ConvexError({ code: "CONFLICT", message: "Room is full" })), false);
  assert.equal(startRaced(new ConvexError({ code: "FORBIDDEN", message: "There is already a live game" })), false);
  assert.equal(startRaced(new Error("network")), false);
});

test("a game page whose header failed says why in plain words, and only a timeout or server error offers to ask again", async () => {
  const { ConvexError } = await import("convex/values");
  const { gameErrorWords } = await import("../src/site/lib/errors.ts");
  const slow = gameErrorWords(new Error("[CONVEX Q(v2/games:header)] [Request ID: 1] Server Error Function execution timed out"));
  assert.deepEqual(slow, { text: "This game could not load: the server took too long (it is busy right now). It comes back by itself when the server answers; Try again asks it now.", again: true });
  assert.deepEqual(gameErrorWords(new ConvexError({ code: "NOT_FOUND", message: "x" })), { text: "No such game here. It may belong to another room.", again: false });
  assert.deepEqual(gameErrorWords(new ConvexError({ code: "FORBIDDEN", message: "x" })), { text: "Join the room to watch or play its games.", again: false });
});
