/**
 * Which provider the in-client assistant uses (convex/lib/aiModels.ts assistantMockEnabled): the mock only under
 * AI_MOCK=1 unless ASSISTANT_LIVE=1, so `assistant:live` can make the local assistant real while AI seats stay
 * mocked, and a deployment without AI_MOCK (production) is never mocked by ASSISTANT_LIVE either way.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assistantMockEnabled } from "../../convex/lib/aiModels.ts";

test("the assistant is mocked only under AI_MOCK=1 without ASSISTANT_LIVE=1", () => {
  assert.equal(assistantMockEnabled({ AI_MOCK: "1" }), true, "the local default stays mocked");
  assert.equal(assistantMockEnabled({ AI_MOCK: "1", ASSISTANT_LIVE: "0" }), true, "only the exact value goes live");
  assert.equal(assistantMockEnabled({ AI_MOCK: "1", ASSISTANT_LIVE: "1" }), false, "assistant:live");
  assert.equal(assistantMockEnabled({}), false, "production: real provider");
  assert.equal(assistantMockEnabled({ ASSISTANT_LIVE: "1" }), false);
  assert.equal(assistantMockEnabled({ AI_MOCK: "0" }), false);
});
