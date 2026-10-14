import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "./provider.ts";

// Pre-authored provider configuration: do not accept API origins/models from room input.
// Public standard pricing: https://platform.claude.com/docs/en/about-claude/pricing
export const ANTHROPIC_PLAYER_CONFIG = Object.freeze({
  provider: "anthropic" as const,
  model: "claude-sonnet-5-5",
  billing: "direct" as const,
  inputUsdPerMillion: 2,
  outputUsdPerMillion: 10,
});

export function anthropicProvider(client: Pick<Anthropic, "messages">, config: { model: string; inputUsdPerMillion: number; outputUsdPerMillion: number } = ANTHROPIC_PLAYER_CONFIG): ModelProvider {
  if (!config.model || !Number.isFinite(config.inputUsdPerMillion) || config.inputUsdPerMillion <= 0 ||
      !Number.isFinite(config.outputUsdPerMillion) || config.outputUsdPerMillion <= 0) throw new Error("Vetted model and price ceilings required");
  return {
    estimateMaxUsd: (input, output) =>
      (input * config.inputUsdPerMillion + output * config.outputUsdPerMillion) / 1_000_000,
    async complete(request) {
      if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 ||
          request.maxOutputTokens > 8192) throw new Error("Invalid AI output token limit");
      const result = await client.messages.create({
        model: config.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: "user", content: request.data }],
        // No tools, prompt caching, extended thinking, or separately billable features.
      }, { signal: request.signal, maxRetries: 0 });
      if (result.stop_reason !== "end_turn" || !result.content.length ||
          result.content.some(block => block.type !== "text")) {
        throw new Error("Incomplete or unsupported Anthropic response");
      }
      const text = result.content.map(block => block.type === "text" ? block.text : "").join("");
      const usage = result.usage;
      const inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      if (!text.trim() || !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
          !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0 ||
          usage.output_tokens > request.maxOutputTokens) throw new Error("Invalid Anthropic usage or response");
      return { text, inputTokens, outputTokens: usage.output_tokens };
    },
  };
}

/** Server-only factory: explicit direct endpoint prevents environment-based proxy fallback. */
export function createDirectAnthropicProvider(apiKey: string, config?: { model: string; inputUsdPerMillion: number; outputUsdPerMillion: number }): ModelProvider {
  if (!apiKey.trim()) throw new Error("ANTHROPIC_API_KEY is required");
  return anthropicProvider(new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
    maxRetries: 0,
    timeout: 60000,
  }), config);
}
