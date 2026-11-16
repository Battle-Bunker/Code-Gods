/**
 * What a sandboxed panel may ask to do as its player (src/panes/panel-actions.ts): only the affordances in
 * PANEL_ACTIONS, with arguments the affordance itself accepts, and a requestId the host makes, never the panel's.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkAct } from "../src/panes/panel-actions.ts";
import { isFrameMessage } from "../src/frame/protocol.ts";

test("only the panel actions, with the affordance's own arguments", () => {
  assert.deepEqual(checkAct("chat.send", { text: "hi" }), { op: "chat.send", args: { text: "hi" } });
  assert.ok("error" in checkAct("panel.save", { slug: "x", source: "y" }), "a panel cannot save panels");
  assert.ok("error" in checkAct("room.leave", {}), "nor anything outside the list");
  assert.ok("error" in checkAct("toString", {}), "nor an inherited name");
  assert.ok("error" in checkAct("chat.send", { text: "" }), "the affordance's own limits hold");
  assert.ok("error" in checkAct("chat.send", { text: "hi", roomId: "other" }), "no extra keys (a scope of its own)");
  assert.ok("error" in checkAct("chat.send", null), "arguments are an object");
  assert.ok("error" in checkAct("agent.destroy", {}), "a required argument");
});

test("the panel's requestId is dropped: the host makes its own", () => {
  const out = checkAct("chat.send", { text: "hi", requestId: "someone-elses" });
  assert.ok(!("error" in out));
  assert.equal("requestId" in out.args, false);
});

test("act messages have a shape the host accepts; anything else is dropped", () => {
  assert.ok(isFrameMessage({ type: "act", id: "a1", op: "chat.send", args: { text: "x" } }));
  assert.equal(isFrameMessage({ type: "act", id: "a1", op: "chat.send" }), false, "no args");
  assert.equal(isFrameMessage({ type: "act", id: "x".repeat(65), op: "chat.send", args: {} }), false, "a long id");
  assert.equal(isFrameMessage({ type: "act", id: "a1", op: 3, args: {} }), false, "an op that is not a name");
});
