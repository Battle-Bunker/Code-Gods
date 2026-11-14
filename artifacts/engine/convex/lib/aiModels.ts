/**
 * Backend allowlist of AI models (clients cannot select API origins or unpriced models). Rates are standard text-token
 * prices in USD per million (ported from api-server ai-provider.ts), with the prompt-cache rates the assistant uses:
 * Anthropic cache reads (0.1x input; 0.05x on Opus 5.5) and 5-minute cache writes (1.25x); OpenAI cached input (0.25x).
 */
export const AI_MODEL_CATALOG = Object.freeze([
  Object.freeze({ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic" as const, inputUsdPerMillion: 2, outputUsdPerMillion: 10, cacheReadUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 2.5 }),
  Object.freeze({ id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic" as const, inputUsdPerMillion: 4, outputUsdPerMillion: 20, cacheReadUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 5 }),
  Object.freeze({ id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai" as const, inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6, cacheReadUsdPerMillion: 0.1 }),
]);
export type AIModel = (typeof AI_MODEL_CATALOG)[number];
/**
 * Players that call no model, free and always available: "example-agent" summons its rule's
 * example agent once (the one the forge pre-fills for a new player) and leaves it alone.
 * A practice game seats them (aiTemplates PRACTICE_TEMPLATE_ID), so a player who only summons the example meets equals.
 */
export const BUILTIN_AI_MODELS = Object.freeze([Object.freeze({ id: "example-agent", label: "Example agent (no model)", provider: "builtin" as const, inputUsdPerMillion: 0, outputUsdPerMillion: 0 })]);
export const isBuiltinModel = (provider: string, model: string) => BUILTIN_AI_MODELS.some(m => m.provider === provider && m.id === model);
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";
export function findModel(provider: string, model: string): AIModel | undefined {
  return AI_MODEL_CATALOG.find(item => item.provider === provider && item.id === model);
}
/**
 * Each room's two per-game token quotas, configurable by its owner (rooms.setAiQuotas; 0 = none): the AI players' pool
 * (all AI seats of one game together) and each player's assistant. New and migrated rooms start at these defaults.
 */
export const DEFAULT_AI_QUOTA = 300_000, DEFAULT_ASSISTANT_QUOTA = 300_000;
export const AI_QUOTA_MAX = 1_000_000, ASSISTANT_QUOTA_MAX = 2_000_000;
/** Host-key safety ceilings, in addition to the room's AI players' quota. */
export const GAME_USD = 2, DAILY_HOST_USD = 5, CALLS_PER_MINUTE = 6;
/**
 * The in-client assistant's pool (assistant/*), separate from the seats': USD reserved per room per game and per
 * UTC day across rooms, and model calls per player and per room per rolling minute.
 */
export const ASSISTANT_GAME_USD = 2, DAILY_ASSISTANT_USD = 5, ASSISTANT_CALLS_PER_MINUTE = 8, ASSISTANT_ROOM_CALLS_PER_MINUTE = 30;
export const PROMPT_MAX = 10_000;
export const mockEnabled = () => process.env.AI_MOCK === "1";
export const providerConfigured = (provider: string) =>
  !!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
