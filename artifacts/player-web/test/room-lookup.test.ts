/**
 * The hosted client's room lookup (src/core/room-lookup.ts): rooms.get throws NOT_FOUND for an unknown code,
 * which must become a message on the "Which room?" form, never an error that takes down the page.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { roomLookup } from "../src/core/room-lookup.ts";

test("no code yet asks for one; a pending query is loading; a room is found", () => {
  assert.deepEqual(roomLookup("", undefined), { state: "ask" });
  assert.deepEqual(roomLookup("4STC", undefined), { state: "loading" });
  const room = { id: "r1" };
  assert.deepEqual(roomLookup("4STC", room), { state: "found", room });
});

test("an unknown room code asks again with a message naming the code", () => {
  const missing = new ConvexError({ code: "NOT_FOUND", message: "Room not found" });
  assert.deepEqual(roomLookup("ZZZZ", missing), { state: "ask", error: "No room ZZZZ on this engine." });
});

test("any other engine error asks again with the engine's message", () => {
  assert.deepEqual(roomLookup("4STC", new ConvexError({ code: "FORBIDDEN", message: "Not allowed here" })), { state: "ask", error: "Not allowed here" });
  assert.deepEqual(roomLookup("4STC", new Error("[CONVEX Q(rooms:get)] Server Error\nmore")), { state: "ask", error: "[CONVEX Q(rooms:get)] Server Error" });
});
