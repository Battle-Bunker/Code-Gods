/**
 * Live queries that fail transiently are retried (src/lib/live-retry.ts, used by site/lib/convex.tsx useLive and the
 * replay): Convex re-runs a failed query only when what it read changes, so without a retry a page stays on the error
 * (the site smoke caught a game page stuck on "Function execution timed out"). What would break: the engine's refusals
 * retried, an error hidden for good, a flicker to loading between retries, or old data shown outside a retry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { MAX_RETRIES, liveResult, retryDelay, transientQueryError } from "../src/lib/live-retry.ts";

const timeout = new Error("[CONVEX Q(games:view)] Function execution timed out (maximum duration: 1s)");
const refusal = new ConvexError({ code: "FORBIDDEN", message: "Join this room first" }) as unknown as Error;

test("timeouts and server errors are transient; the engine's refusals are not", () => {
  assert.equal(transientQueryError(timeout), true);
  assert.equal(transientQueryError(new Error("[Request ID: 1] Server Error")), true);
  assert.equal(transientQueryError(refusal), false);
  assert.equal(transientQueryError(undefined), false);
});

test("retries back off from 1 s to at most 30 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(retryDelay), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test("during a retry the last answer stays on screen; with none, the error does (never a flicker to loading)", () => {
  const kept = { status: "active" };
  assert.deepEqual(liveResult(false, timeout, { attempts: 0, data: kept, error: timeout }), { data: kept, error: null, isLoading: false });
  assert.deepEqual(liveResult(false, undefined, { attempts: 2, data: kept, error: timeout }), { data: kept, error: null, isLoading: false }, "dropped and resubscribing");
  assert.deepEqual(liveResult(false, undefined, { attempts: 2, data: undefined, error: timeout }), { data: undefined, error: timeout, isLoading: false });
});

test("the error is shown once the retries are spent, and at once for a refusal", () => {
  assert.deepEqual(liveResult(false, timeout, { attempts: MAX_RETRIES, data: { a: 1 }, error: timeout }), { data: undefined, error: timeout, isLoading: false });
  assert.deepEqual(liveResult(false, refusal, { attempts: 1, data: { a: 1 }, error: timeout }), { data: undefined, error: refusal, isLoading: false });
  assert.deepEqual(liveResult(false, refusal, null), { data: undefined, error: refusal, isLoading: false });
});

test("outside a retry: a fresh answer, or loading (no data kept from before, e.g. another account)", () => {
  assert.deepEqual(liveResult(false, { b: 2 }, null), { data: { b: 2 }, error: null, isLoading: false });
  assert.deepEqual(liveResult(false, undefined, null), { data: undefined, error: null, isLoading: true });
  assert.deepEqual(liveResult(true, undefined, null), { data: undefined, error: null, isLoading: false });
});
