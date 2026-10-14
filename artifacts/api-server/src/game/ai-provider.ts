import { createDirectAnthropicProvider, createDirectOpenAIProvider, type ModelProvider } from "@workspace/ai-player";

// Backend allowlist only: clients cannot select API origins or unpriced models.
// Rates are standard uncached text-token ceilings in USD per million.
export const AI_MODEL_CATALOG = Object.freeze([
  Object.freeze({ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" as const, inputUsdPerMillion: 2, outputUsdPerMillion: 10 }),
  Object.freeze({ id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" as const, inputUsdPerMillion: 4, outputUsdPerMillion: 20 }),
  Object.freeze({ id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" as const, inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 }),
]);
export function getAIModel(provider: string, model: string) {
  const config = AI_MODEL_CATALOG.find(item => item.provider === provider && item.id === model);
  if (!config) throw Object.assign(new Error("Select an available model for the chosen provider"), { status: 400 });
  return config;
}
export function getAIProvider(selection: { provider: string; model: string }): ModelProvider {
  const config = getAIModel(selection.provider, selection.model);
  const key = config.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw Object.assign(new Error(`AI players require a server-side ${config.provider} API key`), { status: 503 });
  return config.provider === "anthropic"
    ? createDirectAnthropicProvider(key, { ...config, model: config.id })
    : createDirectOpenAIProvider(key, config.id, config);
}
export function aiFundingStatus() {
  return {
    provider: "anthropic", model: "claude-sonnet-5-5", billing: "direct",
    configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()), live: true,
  };
}
