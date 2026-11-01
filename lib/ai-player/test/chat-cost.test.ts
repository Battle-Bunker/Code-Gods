/**
 * The assistant's cost accounting (src/chat.ts): what a step costs in USD and in allowance tokens once the provider
 * reports cache reads and writes, the worst case a step reserves, the input estimate against recorded live usage, and
 * what a cancelled step is billed. Expectations are worked by hand from the catalogue prices.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CHARS_PER_TOKEN, abortedOutputTokens, inputReservation, usageCost, worstCaseCost } from "../src/index.ts";

// claude-sonnet-5-5 (artifacts/engine/convex/lib/aiModels.ts): $2 in, $10 out, $0.20 cache read, $2.50 cache write.
const sonnet = { inputUsdPerMillion: 2, outputUsdPerMillion: 10, cacheReadUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 2.5 };
const gptMini = { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6, cacheReadUsdPerMillion: 0.1 };

test("usageCost prices cache reads and writes and counts allowance tokens at their price relative to input", () => {
  // 20,000 input: 17,000 read, 2,000 written, 1,000 uncached; 500 output.
  const cost = usageCost(sonnet, { inputTokens: 20_000, cacheReadTokens: 17_000, cacheWriteTokens: 2_000, outputTokens: 500 });
  // USD: 1000*2 + 17000*0.2 + 2000*2.5 + 500*10 = 2000 + 3400 + 5000 + 5000 = 15400 per million.
  assert.ok(Math.abs(cost.usd - 0.0154) < 1e-12, String(cost.usd));
  // Tokens: 1000 + 17000*0.1 + 2000*1.25 + 500 = 1000 + 1700 + 2500 + 500.
  assert.equal(cost.tokens, 5_700);
  // Without a cache the allowance counts exactly input + output, as before caching.
  assert.deepEqual(usageCost(sonnet, { inputTokens: 20_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 500 }).tokens, 20_500);
  // OpenAI: cached input at a quarter of the price; no write premium.
  assert.equal(usageCost(gptMini, { inputTokens: 8_000, cacheReadTokens: 4_096, cacheWriteTokens: 0, outputTokens: 100 }).tokens, 3_904 + 1_024 + 100);
});

test("worstCaseCost counts every input token at its dearest price (an Anthropic cache write) plus the output ceiling", () => {
  const worst = worstCaseCost(sonnet, 10_000, 8_192);
  assert.equal(worst.tokens, 12_500 + 8_192);
  assert.ok(Math.abs(worst.usd - (10_000 * 2.5 + 8_192 * 10) / 1e6) < 1e-12);
  assert.equal(worstCaseCost(gptMini, 10_000, 8_192).tokens, 18_192, "no write premium at OpenAI");
  // A settled step never costs more than its worst case.
  const actual = usageCost(sonnet, { inputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 10_000, outputTokens: 8_192 });
  assert.ok(actual.tokens <= worst.tokens && actual.usd <= worst.usd + 1e-15);
});

// Recorded live usage: the request size (system prompt + history JSON + tool schemas JSON, in characters) and the
// input tokens the provider billed, from `test:assistant-live` runs on the local deployment.
const LIVE = {
  anthropic: [
    { model: "claude-sonnet-5-5", chars: 44_056, inputTokens: 16_399 },
    { model: "claude-sonnet-5-5", chars: 45_863, inputTokens: 17_011 },
    { model: "claude-sonnet-5-5", chars: 53_938, inputTokens: 20_322 },
  ],
  openai: [
    { model: "gpt-4.1-mini", chars: 44_271, inputTokens: 9_672 },
    { model: "gpt-4.1-mini", chars: 46_020, inputTokens: 10_005 },
    { model: "gpt-4.1-mini", chars: 53_892, inputTokens: 12_058 },
    { model: "gpt-4.1-mini", chars: 54_132, inputTokens: 12_100 },
    { model: "gpt-4.1-mini", chars: 63_264, inputTokens: 14_691 },
  ],
};

test("the characters-per-token reservation is within 1.0x–1.3x of recorded live input usage", () => {
  for (const [provider, samples] of Object.entries(LIVE) as [keyof typeof LIVE, typeof LIVE.anthropic][]) {
    for (const s of samples) {
      const reserved = inputReservation({ tokens: Math.ceil(s.chars / CHARS_PER_TOKEN[provider]), counted: false });
      const ratio = reserved / s.inputTokens;
      assert.ok(ratio >= 1 && ratio <= 1.3, `${provider} ${s.model}: reserved ${reserved} for ${s.inputTokens} actual (${ratio.toFixed(2)}x)`);
    }
  }
});

test("a cancelled step's output: the streamed characters' tokens plus hidden reasoning time at the speed bound, within the ceiling", () => {
  assert.equal(abortedOutputTokens({ outputChars: 0, reasoningMs: 0 }, 8192), 0, "nothing streamed, no reasoning");
  // 250 characters at 2.5 a token, plus a small margin.
  assert.equal(abortedOutputTokens({ outputChars: 250, reasoningMs: 0 }, 8192), 108);
  // 3 s of reasoning at 400 tokens a second.
  assert.equal(abortedOutputTokens({ outputChars: 0, reasoningMs: 3000 }, 8192), 1200);
  assert.equal(abortedOutputTokens({ outputChars: 100_000, reasoningMs: 60_000 }, 8192), 8192, "never above the ceiling");
});
