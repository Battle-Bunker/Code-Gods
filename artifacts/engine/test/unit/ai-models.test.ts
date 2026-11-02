/** The AI model catalog against what each provider adapter needs. */
import test from "node:test";
import assert from "node:assert/strict";
import { openAISupportsStructuredOutputs } from "@workspace/ai-player";
import { AI_MODEL_CATALOG } from "../../convex/lib/aiModels.ts";

test("every OpenAI model offered for AI seats takes strict structured outputs (no seat silently drops to JSON mode)", () => {
  const openai = AI_MODEL_CATALOG.filter(m => m.provider === "openai");
  assert.ok(openai.length > 0);
  for (const m of openai) assert.equal(openAISupportsStructuredOutputs(m.id), true, m.id);
});
