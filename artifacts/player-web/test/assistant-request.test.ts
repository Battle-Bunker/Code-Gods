/** Bringing the assistant's composer into view (src/panes/assistant-request.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { composerKey, filledDraft, onComposerRequest, requestComposer, takeComposerRequest } from "../src/panes/assistant-request.ts";

test("Ctrl+` from anywhere; '/' only outside a field, a chord or a dialog (v1)", () => {
  assert.equal(composerKey({ key: "`", ctrl: true, typing: true }), true);
  assert.equal(composerKey({ key: "/" }), true);
  assert.equal(composerKey({ key: "/", typing: true }), false);
  assert.equal(composerKey({ key: "/", dialog: true }), false);
  assert.equal(composerKey({ key: "/", meta: true }), false);
  assert.equal(composerKey({ key: "a" }), false);
});

test("a fill goes first and keeps what was typed; no fill leaves the draft", () => {
  assert.equal(filledDraft("", "Line 3: "), "Line 3: ");
  assert.equal(filledDraft("why is it low?", "Line 3: "), "Line 3: why is it low?");
  assert.equal(filledDraft("half a thought", undefined), "half a thought");
});

test("a request opens the assistant pane and is taken once", async () => {
  const opened: string[] = [];
  let heard = 0;
  const off = onComposerRequest(() => { heard++; });
  await requestComposer({ fill: "Line 2: " }, async p => { opened.push(p); });
  off();
  assert.deepEqual(opened, ["assistant"]);
  assert.ok(heard >= 1);
  assert.deepEqual(takeComposerRequest(), { fill: "Line 2: " });
  assert.equal(takeComposerRequest(), null);
});
