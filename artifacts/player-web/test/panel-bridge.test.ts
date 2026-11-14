/**
 * The stored-panel bridge's protocol (src/frame/protocol.ts): what a panel's sandboxed frame may ask the app for, and
 * which messages the app accepts at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptMessage, checkCall, frameVersionProblem, isFrameMessage, PANEL_HOOKS } from "../src/frame/protocol.ts";
import { PANEL_SDK } from "../src/sdk/panel.ts";

test("only the frame's own window with the boot nonce is heard", () => {
  const frame = {}, other = {};
  const data = { type: "ready", sdk: PANEL_SDK, nonce: "n1" };
  assert.deepEqual(acceptMessage({ source: frame, data }, frame, "n1"), data);
  assert.equal(acceptMessage({ source: other, data }, frame, "n1"), null, "another window");
  assert.equal(acceptMessage({ source: frame, data: { ...data, nonce: "n2" } }, frame, "n1"), null, "another nonce");
  assert.equal(acceptMessage({ source: frame, data: { type: "evil", nonce: "n1" } }, frame, "n1"), null, "an unknown type");
  assert.equal(acceptMessage({ source: frame, data }, null, "n1"), null, "no frame yet");
});

test("frame messages are checked for shape, not only type", () => {
  assert.ok(isFrameMessage({ type: "watch", id: "s1", hook: "useGame", args: [] }));
  assert.ok(!isFrameMessage({ type: "watch", id: 3, hook: "useGame", args: [] }), "a numeric id");
  assert.ok(!isFrameMessage({ type: "watch", id: "s1", hook: "useGame", args: "x" }), "args not a list");
  assert.ok(isFrameMessage({ type: "resize", height: 120 }));
  assert.ok(!isFrameMessage({ type: "resize", height: "120" }));
  assert.ok(!isFrameMessage(null));
});

test("a frame built for another SDK version is refused, with words a player understands", () => {
  assert.equal(frameVersionProblem({ type: "ready", sdk: PANEL_SDK }), null);
  assert.match(frameVersionProblem({ type: "ready", sdk: 1 }) ?? "", /older version/);
  assert.match(frameVersionProblem({ type: "ready" }) ?? "", /older version/);
});

test("a panel may call the SDK's game hooks, with their arguments cleaned", () => {
  assert.deepEqual(checkCall("useGame", []), { hook: "useGame", args: [] });
  assert.deepEqual(checkCall("useGame", ["ignored"]), { hook: "useGame", args: [] }, "extra arguments are dropped");
  assert.deepEqual(checkCall("useObjectIds", ["rarity", 10]), { hook: "useObjectIds", args: ["rarity", 10] });
  assert.deepEqual(checkCall("useObjectIds", ["sideways", 10_000]), { hook: "useObjectIds", args: ["points", 100] }, "a bad sort and a huge page are clamped");
  assert.deepEqual(checkCall("useMoves", []), { hook: "useMoves", args: [30] });
  assert.deepEqual(checkCall("useChat", [0]), { hook: "useChat", args: [1] });
  assert.deepEqual(checkCall("useMyObject", ["obj1"]), { hook: "useMyObject", args: ["obj1"] });
  assert.deepEqual(checkCall("useMyObject", [null]), { hook: "useMyObject", args: [null] });
  assert.deepEqual(checkCall("useMyObject", [{ $gt: 1 }]), { hook: "useMyObject", args: [null] }, "an id is a short string or nothing");
  assert.deepEqual(checkCall("useMyObjects", [["a", 2, "b"]]), { hook: "useMyObjects", args: [["a", "b"]] });
  assert.equal((checkCall("useMyObjects", [Array.from({ length: 500 }, (_, i) => `o${i}`)]) as { args: string[][] }).args[0]!.length, 100);
});

test("anything outside the panel SDK is refused by name", () => {
  for (const hook of ["useAssistantTranscript", "useAssistantStatus", "noteSummoned", "constructor", "__proto__", "toString"]) {
    const out = checkCall(hook, []);
    assert.ok("error" in out, hook);
    assert.match((out as { error: string }).error, /not available to panels/);
  }
  assert.ok(!Object.hasOwn(PANEL_HOOKS, "useAssistantThreads"), "a player's private assistant conversation is not panel data");
});

test("the frame's @sdk answers exactly the bridge's hooks, and each is a hook of the app's SDK", () => {
  // Catches: a hook added to the bridge but not to the frame's SDK (or the reverse), so a panel's import is missing.
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const frame = [...read("../src/frame/sdk.ts").matchAll(/^export const (use\w+)/gm)].map(m => m[1]).sort();
  assert.deepEqual(frame, Object.keys(PANEL_HOOKS).sort());
  const app = read("../src/sdk/hooks.ts");
  for (const hook of Object.keys(PANEL_HOOKS)) assert.match(app, new RegExp(`export function ${hook}\\(`), hook);
});

test("paged hooks are marked, so the frame can ask for more", () => {
  assert.equal(PANEL_HOOKS.useMoves.kind, "paged");
  assert.equal(PANEL_HOOKS.useChat.kind, "paged");
  assert.equal(PANEL_HOOKS.useGame.kind, "value");
});
