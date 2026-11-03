/**
 * A failing tick's public notice and backoff (convex/lib/engineErrors.ts). Catches: a retry loop with no backoff (or one
 * slower than the watchdog), a raw engine error shown to players (it can name a god's family), a park with no notice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { engineErrorReason, gameNotice, retryDelayMs } from "../../convex/lib/engineErrors.ts";

test("retries back off from 2 s, doubling, capped at the watchdog's minute", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 50].map(retryDelayMs), [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
});

test("the public reason is a fixed phrase, never the error", () => {
  assert.equal(engineErrorReason("No calibration table for chessmaster, chessmaster in Grid(4,base10,rgb)"),
    "its scoring tables could not be loaded (usually a deploy in progress)");
  assert.equal(engineErrorReason("kingdom {\"colour\":\"blue\"} exploded"), "an internal error");
});

test("a game's notice: engine retrying, idle park, safety pause, or none", () => {
  assert.deepEqual(gameNotice({ phase: "running", engineError: { reason: "an internal error" } }),
    { kind: "retrying", text: "The engine hit an error and is retrying: an internal error." });
  assert.deepEqual(gameNotice({ phase: "recovery", autoResume: true, recoveryReason: "idle" }),
    { kind: "idle", text: "Paused: no human activity for 30 min — click anywhere to resume." });
  assert.equal(gameNotice({ phase: "recovery", recoveryReason: "The world reached its 2,000-object safety limit." })?.text,
    "Paused for safety: The world reached its 2,000-object safety limit. The room's owner can resume it.");
  assert.equal(gameNotice({ phase: "running" }), undefined);
  assert.equal(gameNotice({ phase: "ended", engineError: { reason: "x" } }), undefined);
});
