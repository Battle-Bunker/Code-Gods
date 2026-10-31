/**
 * Backend allowlist of AI models (clients cannot select API origins or unpriced models). Rates are standard
 * uncached text-token ceilings in USD per million (ported from api-server ai-provider.ts).
 */
export const AI_MODEL_CATALOG = Object.freeze([
  Object.freeze({ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" as const, inputUsdPerMillion: 2, outputUsdPerMillion: 10 }),
  Object.freeze({ id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" as const, inputUsdPerMillion: 4, outputUsdPerMillion: 20 }),
  Object.freeze({ id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" as const, inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 }),
]);
export type AIModel = (typeof AI_MODEL_CATALOG)[number];
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";
export function findModel(provider: string, model: string): AIModel | undefined {
  return AI_MODEL_CATALOG.find(item => item.provider === provider && item.id === model);
}
/** Host-key safety ceilings, in addition to the room owner's token budget. */
export const GAME_USD = 2, DAILY_HOST_USD = 5, CALLS_PER_MINUTE = 6;
/**
 * The in-client assistant's pool (assistant/*), separate from the seats': USD reserved per room per game and per
 * UTC day across rooms, model calls per player and per room per rolling minute, and the largest per-human allowance.
 */
export const ASSISTANT_GAME_USD = 2, DAILY_ASSISTANT_USD = 5, ASSISTANT_CALLS_PER_MINUTE = 8, ASSISTANT_ROOM_CALLS_PER_MINUTE = 30;
export const ASSISTANT_BUDGET_MAX = 2_000_000;
export const PROMPT_MAX = 10_000;
export const mockEnabled = () => process.env.AI_MOCK === "1";
/**
 * The in-client assistant uses the mock only under AI_MOCK=1 without ASSISTANT_LIVE=1, so a local deployment can
 * run the assistant against a real provider while AI seats stay mocked (scripts/assistant-provider.mjs).
 * Production sets neither, so it is unaffected.
 */
export const assistantMockEnabled = (env: Record<string, string | undefined> = process.env) =>
  env.AI_MOCK === "1" && env.ASSISTANT_LIVE !== "1";
export const providerConfigured = (provider: string) =>
  !!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
