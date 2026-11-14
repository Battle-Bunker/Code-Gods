/**
 * The models a host may run, with their prices (USD per million tokens, standard text rates). Nothing outside this list
 * is callable: clients never choose an API origin or an unpriced model. Anthropic cache reads and 5-minute cache writes
 * (1.25x input); OpenAI cached input (0.25x).
 */
import type { Prices } from "./chat.ts";

export type ProviderId = "anthropic" | "openai";
export interface Model { readonly id: string; readonly label: string; readonly provider: ProviderId; readonly prices: Readonly<Prices> }

export const MODELS: readonly Model[] = Object.freeze([
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", prices: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", prices: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 } },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "anthropic", prices: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai", prices: { input: 0.4, output: 1.6, cacheRead: 0.1 } },
] as const satisfies readonly Model[]);

export const DEFAULT_MODEL = "claude-opus-5-5";

export const findModel = (id: string): Model | undefined => MODELS.find(m => m.id === id);
