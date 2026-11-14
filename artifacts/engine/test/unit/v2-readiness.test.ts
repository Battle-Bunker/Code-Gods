/** Sandbox readiness is keyed by the runtime actually pinned (convex/v2/readiness.ts): a new bundle warms afresh. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PYTHON_BUNDLE_SHA256 } from "@workspace/v2-sandbox";
import { RUNTIME_VERSION } from "../../convex/v2/readiness.ts";

test("the Python runtime's readiness key is the pinned bundle's hash", () => {
  assert.equal(RUNTIME_VERSION.python, `cpython:${PYTHON_BUNDLE_SHA256}`);
});
