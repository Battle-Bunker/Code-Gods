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
