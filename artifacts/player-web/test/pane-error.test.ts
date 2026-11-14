/** A failed pane in plain words, and a Try again that asks the server afresh (src/dock/pane-error.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { paneErrorWords } from "../src/dock/pane-error.ts";

test("a server timeout reads in plain words and retries by reloading (round 8/04: raw error, same request ID)", () => {
  const w = paneErrorWords(new Error("[CONVEX Q(v2/play:moves)] [Request ID: d4eecc2af49a3060] Server Error Function execution timed out (maximum duration: 1s) Called by client"));
  assert.equal(w.text, "This pane could not load: the server took too long (it is busy right now).");
  assert.equal(w.reload, true);
  assert.doesNotMatch(w.text, /CONVEX|Request ID/);
});

test("an app error keeps its own words and retries in place", () => {
  assert.deepEqual(paneErrorWords(new Error("No such line.")), { text: "This pane could not load: No such line.", reload: false });
});
