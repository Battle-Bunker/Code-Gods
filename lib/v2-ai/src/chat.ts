/**
 * One tool-calling chat step, provider-neutral. Adapters: Anthropic Messages (anthropic.ts), OpenAI chat completions
 * (openai.ts) and the scripted offline mock (mock.ts). Every adapter:
 *   - makes exactly one attempt over plain `fetch`, with the key it was given (never read from the environment);
 *   - returns only complete answers (a final answer or a tool-use stop); a cut, a refusal or any other stop throws
 *     `ChatError`, carrying the usage when the provider billed it, so a truncated reply is never acted on;
 *   - checks the provider's usage before a caller settles a budget against it;
 *   - returns reasoning blocks opaque and in order, and replays its own unchanged (the caller keeps a conversation
 *     append-only).
 */
import type { AssistantTool } from "@workspace/v2-affordances";

/** A tool the model may call: the Messages API's tool shape, as `assistantTools(ctx)` generates it. */
export type ChatTool = AssistantTool;

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
/** A provider's reasoning block, opaque: replayed byte for byte, and only to the provider that made it. */
export type ThinkingBlock = { type: "thinking"; provider: "anthropic"; block: Record<string, unknown> };
export type ToolResultBlock = { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type AssistantBlock = TextBlock | ToolUseBlock | ThinkingBlock;
export type ChatMessage =
  | { role: "user"; content: string | (TextBlock | ToolResultBlock)[] }
  | { role: "assistant"; content: AssistantBlock[] };

export interface ChatRequest {
  system: string;
  messages: readonly ChatMessage[];
  tools: readonly ChatTool[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}

/** One call's usage. `inputTokens` is every input token; the cache parts are within it (priced differently). */
export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
export const NO_USAGE: Usage = Object.freeze({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

export interface ChatStep {
  /** The model's blocks in order, reasoning included: append them unchanged as the next assistant message. */
  content: AssistantBlock[];
  stop: "end_turn" | "tool_use";
  usage: Usage;
}

export interface ChatProvider {
  readonly model: string;
  /** What this provider bills (USD per million tokens). */
  readonly prices: Prices;
  step(request: ChatRequest): Promise<ChatStep>;
}

/** Prices in USD per million tokens. Cache prices default to the input price (a provider without a prompt cache). */
export interface Prices { input: number; output: number; cacheRead?: number; cacheWrite?: number }

export const MAX_OUTPUT_TOKENS = 32_000;

/** A failed step. `usage` is set when the provider billed it (a cut answer, a refusal), so the caller can settle it. */
export class ChatError extends Error {
  readonly usage?: Usage;
  readonly status?: number;
  constructor(message: string, usage?: Usage, status?: number) {
    super(message);
    this.name = "ChatError";
    this.usage = usage;
    this.status = status;
  }
}

export function checkPrices(model: string, p: Prices) {
  const bad = (v: number | undefined, optional: boolean) => v === undefined ? !optional : !Number.isFinite(v) || v <= 0;
  if (!model || bad(p.input, false) || bad(p.output, false) || bad(p.cacheRead, true) || bad(p.cacheWrite, true)) {
    throw new Error("A catalogued model and positive prices are required");
  }
}

export function checkRequest(r: ChatRequest) {
  if (!Number.isSafeInteger(r.maxOutputTokens) || r.maxOutputTokens < 1 || r.maxOutputTokens > MAX_OUTPUT_TOKENS) {
    throw new Error("Invalid output token limit");
  }
  r.signal?.throwIfAborted();
}

const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
/** Provider usage a caller may settle against, or a throw. */
export function checkUsage(input: unknown, output: unknown, maxOutput: number, read: unknown = 0, write: unknown = 0): Usage {
  if (!count(input) || !count(output) || output > maxOutput || !count(read) || !count(write) || read + write > input) {
    throw new ChatError("Invalid or missing provider usage");
  }
  return { inputTokens: input, outputTokens: output, cacheReadTokens: read, cacheWriteTokens: write };
}

/** What a call costs in USD. */
export function usageUsd(p: Prices, u: Usage): number {
  const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  return (uncached * p.input + u.cacheReadTokens * (p.cacheRead ?? p.input) + u.cacheWriteTokens * (p.cacheWrite ?? p.input) +
    u.outputTokens * p.output) / 1_000_000;
}

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/**
 * An upper estimate of a request's input tokens: its JSON size over 2.5 characters a token (tool schemas and escaped
 * history tokenize densely; measured 2.65 to 2.70 on Anthropic, 4.3 on OpenAI).
 */
export const estimateInputTokens = (r: Pick<ChatRequest, "system" | "messages" | "tools">) =>
  Math.ceil((r.system.length + JSON.stringify(r.messages).length + JSON.stringify(r.tools).length) / 2.5) + 64;

/** Consecutive messages of one role merged into one (tool results followed by the next question). */
export function mergeTurns(messages: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const blocks = (m: ChatMessage) => typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
  for (const m of messages) {
    const last = out.at(-1);
    if (last && last.role === m.role) out[out.length - 1] = { role: m.role, content: [...blocks(last), ...blocks(m)] } as ChatMessage;
    else out.push(m);
  }
  return out;
}

/** The assistant's final text: its text blocks joined. */
export const textOf = (content: readonly AssistantBlock[]) => content.flatMap(b => b.type === "text" ? [b.text] : []).join("");

/** A JSON POST over fetch; a non-2xx answer throws a ChatError with its status (refused before any answer: unbilled). */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = undefined; }
  if (!res.ok) {
    const msg = (json as { error?: { message?: unknown } } | undefined)?.error?.message;
    throw new ChatError(`Provider error ${res.status}: ${typeof msg === "string" ? msg.slice(0, 300) : text.slice(0, 300)}`, undefined, res.status);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new ChatError("Provider answered with no JSON object");
  return json as Record<string, unknown>;
}
