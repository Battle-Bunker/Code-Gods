/** A failed pane in plain words, and a Try again that asks the server afresh (src/dock/pane-error.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveError, liveSourceOf, paneErrorWords } from "../src/dock/pane-error.ts";

test("a server timeout reads in plain words and retries by reloading (round 8/04: raw error, same request ID)", () => {
  const w = paneErrorWords(new Error("[CONVEX Q(v2/play:moves)] [Request ID: d4eecc2af49a3060] Server Error Function execution timed out (maximum duration: 1s) Called by client"));
  assert.equal(w.text, "This pane could not load: the server took too long (it is busy right now).");
  assert.equal(w.reload, true);
  assert.doesNotMatch(w.text, /CONVEX|Request ID/);
});

test("an app error keeps its own words and retries in place", () => {
  assert.deepEqual(paneErrorWords(new Error("No such line.")), { text: "This pane could not load: No such line.", reload: false });
});

test("a failed live read comes back by itself (round 24: panes stayed broken until a reload): it names its query, so the error panel keeps that one subscription open and shows the pane again on its next answer", () => {
  const cause = new Error("[CONVEX Q(v2/play:object)] [Request ID: 1] Server Error Function execution timed out (maximum duration: 1s)");
  const query = { name: "v2/play:object" }, args = { objectId: "o1" };
  const e = new LiveError(cause, query, args);
  assert.equal(e.message, cause.message, "the same words as the server's error");
  assert.deepEqual(liveSourceOf(e), { query, args });
  const w = paneErrorWords(e);
  assert.equal(w.reload, false, "no reload: the subscription brings it back");
  assert.equal(w.text, "This pane could not load: the server took too long (it is busy right now). It comes back by itself as soon as the server answers.");
  assert.equal(liveSourceOf(cause), null, "an error that is not a live read has no source");
});
