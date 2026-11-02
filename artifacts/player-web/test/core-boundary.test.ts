/**
 * The dock's error boundary (src/core/core-boundary-model.ts): an error is shown, never retried on a timer. The core
 * remounts (and so resubscribes) only when Convex has connected afresh since the error, which is when its next value
 * can arrive; a refused credential waits for the human to reconnect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { coreErrorKind, clearsOnReconnect } from "../src/core/core-boundary-model.ts";

test("a refused credential is told apart from losing the engine", () => {
  assert.equal(coreErrorKind("[CONVEX Q(player:observation)] UNAUTHENTICATED: no credential"), "credential");
  assert.equal(coreErrorKind("This credential was revoked"), "credential");
  assert.equal(coreErrorKind("Server Error: query timed out"), "other");
});

test("an error clears only after Convex reconnects since it was caught; time alone never clears it", () => {
  // Catches: the old 3-second remount loop (an error clearing with no new connection), and a credential error
  // remounting forever against an engine that refuses it.
  const caught = { kind: "other" as const, atConnection: 2 };
  assert.equal(clearsOnReconnect(caught, 2), false, "same connection: the error stays on screen");
  assert.equal(clearsOnReconnect(caught, 3), true, "a fresh connection: remount and resubscribe once");
  assert.equal(clearsOnReconnect({ kind: "credential", atConnection: 2 }, 3), false, "a refused credential waits for the human");
});
