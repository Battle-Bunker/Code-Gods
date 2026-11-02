/**
 * A live query that fails for a reason other than the engine's own refusal (a timeout under load, a server error)
 * is retried: Convex re-runs a failed query only when what it read changes, so without a retry the page stays on
 * the error (the site smoke caught a game page stuck on "Function execution timed out"). The engine's refusals
 * (ConvexError: not signed in, forbidden, not found) are answers, never retried.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { retryDelay, transientQueryError } from "../src/lib/live-retry.ts";

test("timeouts and server errors are transient; the engine's refusals are not", () => {
  assert.equal(transientQueryError(new Error("[CONVEX Q(games:view)] Function execution timed out (maximum duration: 1s)")), true);
  assert.equal(transientQueryError(new Error("[Request ID: 1] Server Error")), true);
  assert.equal(transientQueryError(new ConvexError({ code: "FORBIDDEN", message: "Join this room first" })), false);
  assert.equal(transientQueryError(undefined), false);
});

test("retries back off from 1 s to at most 30 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelay), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});
