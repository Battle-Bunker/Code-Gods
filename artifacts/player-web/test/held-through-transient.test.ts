/** The game page keeps the dock through a timed-out room or header query (a walker lost a summon to one). */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { heldThroughTransient } from "../src/site/lib/errors.ts";

test("a transient failure keeps the last value for the same arguments; a refusal or other arguments do not", () => {
  const held = { key: "room:r1", data: { id: "r1" } };
  assert.deepEqual(heldThroughTransient(held, "room:r1", { data: { id: "r1", n: 2 } as never, error: null }), { id: "r1", n: 2 }, "a fresh value wins");
  assert.deepEqual(heldThroughTransient(held, "room:r1", { data: undefined, error: new Error("Function execution timed out (maximum duration: 1s)") }), { id: "r1" });
  assert.equal(heldThroughTransient(held, "room:r1", { data: undefined, error: new ConvexError({ code: "FORBIDDEN", message: "not a member" }) }), undefined, "the engine's answer is shown");
  assert.equal(heldThroughTransient(held, "room:r2", { data: undefined, error: new Error("timed out") }), undefined, "another room: nothing old");
  assert.equal(heldThroughTransient(held, "room:r1", { data: undefined, error: null }), undefined, "loading is loading");
  assert.equal(heldThroughTransient(null, "room:r1", { data: undefined, error: new Error("timed out") }), undefined);
});
