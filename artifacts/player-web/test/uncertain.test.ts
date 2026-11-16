import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod/v4";
import { withRequestId, isUncertain } from "../src/core/uncertain.ts";

test("an operation that takes a requestId gets one, kept when the caller gave it; others are untouched", () => {
  const takes = z.object({ requestId: z.string().uuid().optional(), x: z.number() });
  const sent = withRequestId(takes, { x: 1 }) as { requestId: string; x: number };
  assert.match(sent.requestId, /^[0-9a-f-]{36}$/);
  assert.equal((withRequestId(takes, { x: 1, requestId: "keep" }) as { requestId: string }).requestId, "keep");
  assert.deepEqual(withRequestId(z.object({ x: z.number() }), { x: 1 }), { x: 1 });
});

test("uncertain: a thrown error with no outcome (the network), never a refusal the server answered", () => {
  assert.equal(isUncertain(new Error("Connection lost while action was in flight")), true);
  assert.equal(isUncertain(new Error("Failed to fetch")), true);
  assert.equal(isUncertain(new Error("[CONVEX A(v2/ops:x)] Server Error")), false, "the server answered: it rolled back");
  assert.equal(isUncertain({ ok: false, error: { code: "refused", message: "no" } }), false);
});
