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
