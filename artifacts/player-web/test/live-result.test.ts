/**
 * useLive (site/lib/convex.tsx) reports a live query's error as a value (src/lib/live-result.ts), so the page shows it
 * instead of a blank screen, and holds no retry policy of its own (read-architecture R6: Convex resubscribes on
 * reconnect; test/no-one-off-reads.test.ts forbids a client retry). What would break: an error thrown into render, an
 * error kept after the subscription answers again, or stale data shown beside an error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { liveResult } from "../src/lib/live-result.ts";

const timeout = new Error("[CONVEX Q(games:view)] Function execution timed out (maximum duration: 1s)");
const refusal = new ConvexError({ code: "FORBIDDEN", message: "Join this room first" }) as unknown as Error;

test("a query's error is a value, shown at once (no retry, no data kept from before)", () => {
  assert.deepEqual(liveResult(false, timeout), { data: undefined, error: timeout, isLoading: false });
  assert.deepEqual(liveResult(false, refusal), { data: undefined, error: refusal, isLoading: false });
});

test("the next answer clears the error: the result is the subscription's current value only", () => {
  const sequence = [{ a: 1 }, timeout, { a: 2 }].map(answer => liveResult(false, answer));
  assert.deepEqual(sequence.map(r => r.error), [null, timeout, null]);
  assert.deepEqual(sequence.map(r => r.data), [{ a: 1 }, undefined, { a: 2 }]);
});

test("loading while subscribed without an answer; neither loading nor failed when skipped", () => {
  assert.deepEqual(liveResult(false, undefined), { data: undefined, error: null, isLoading: true });
  assert.deepEqual(liveResult(true, undefined), { data: undefined, error: null, isLoading: false });
  assert.deepEqual(liveResult(false, null), { data: null, error: null, isLoading: false }, "null is an answer (not found)");
});
