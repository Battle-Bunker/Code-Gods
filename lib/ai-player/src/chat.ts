/**
 * The streaming, tool-using chat provider of the in-client assistant (docs/surface-architecture.md §6). AI seats use
 * the one-shot JSON ModelProvider (provider.ts); the assistant converses, calls registry tools and streams its text.
 *
 * Adapters: Anthropic Messages (chat-anthropic.ts), OpenAI chat completions (chat-openai.ts) and the scripted mock
 * (chat-mock.ts, engine-selected only under AI_MOCK=1). Every adapter:
 *   - makes exactly one attempt (SDK retries off), honours the abort signal and the output ceiling;
 *   - returns only complete answers: a model stop or a tool-use stop. A max-tokens cut, a refusal or any other stop
 *     is an error, so a truncated reply is never acted on;
 *   - validates provider usage (non-negative integers, output within the ceiling) before the caller settles a budget;
 *   - returns reasoning blocks opaque and in order (ChatThinking), and replays the ones it produced verbatim. Callers
 *     keep a conversation append-only within a turn, so a replayed block's prefix never changes.
 */
export type ChatToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };
export type ChatText = { type: "text"; text: string };
export type ChatToolUse = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
/**
 * A provider's reasoning block (Anthropic `thinking` / `redacted_thinking`), kept opaque: it must be replayed
 * byte-for-byte in the same place, and only to the provider that produced it. Other adapters drop it.
 */
export type ChatThinking = { type: "thinking"; provider: "anthropic"; block: Record<string, unknown> };
export type ChatToolResult = { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };
export type ChatMessage =
  | { role: "user"; content: string | (ChatText | ChatToolResult)[] }
  | { role: "assistant"; content: ChatAssistantBlock[] };
export type ChatAssistantBlock = ChatText | ChatToolUse | ChatThinking;

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ChatToolSpec[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Called with each streamed text delta, in order. */
  onText?: (delta: string) => void;
}
export interface ChatResult {
  /** The model's blocks in order, reasoning included: append them unchanged as the next assistant message. */
  content: ChatAssistantBlock[];
  stopReason: "end_turn" | "tool_use";
  inputTokens: number;
  outputTokens: number;
}
export interface ChatProvider {
  estimateMaxUsd(inputTokens: number, outputTokens: number): number;
  stream(request: ChatRequest): Promise<ChatResult>;
}

export const MAX_CHAT_OUTPUT_TOKENS = 8192;
type Prices = { inputUsdPerMillion: number; outputUsdPerMillion: number };

export function checkPrices(model: string, prices: Prices) {
  if (!model || [prices.inputUsdPerMillion, prices.outputUsdPerMillion].some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error("Vetted model and price ceilings required");
  }
}
export const usdEstimator = (prices: Prices) => (input: number, output: number) =>
  (input * prices.inputUsdPerMillion + output * prices.outputUsdPerMillion) / 1_000_000;

export function checkRequest(request: ChatRequest) {
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > MAX_CHAT_OUTPUT_TOKENS) {
    throw new Error("Invalid AI output token limit");
  }
  request.signal.throwIfAborted();
}

/** Provider usage the caller may settle a budget against, or an error. */
export function checkUsage(inputTokens: unknown, outputTokens: unknown, maxOutputTokens: number): { inputTokens: number; outputTokens: number } {
  if (!Number.isSafeInteger(inputTokens) || (inputTokens as number) < 0 || !Number.isSafeInteger(outputTokens) || (outputTokens as number) < 0 ||
      (outputTokens as number) > maxOutputTokens) throw new Error("Invalid or missing provider usage");
  return { inputTokens: inputTokens as number, outputTokens: outputTokens as number };
}

/** A complete answer's stop, mapped from the provider's; anything else (a cut, a refusal) is an error. */
export function completeStop(stop: string | null | undefined, map: Record<string, ChatResult["stopReason"]>): ChatResult["stopReason"] {
  const mapped = stop ? map[stop] : undefined;
  if (!mapped) throw new Error(`Incomplete model answer (stop: ${stop ?? "none"})`);
  return mapped;
}

/** Consecutive messages of the same role merged into one (tool results followed by the next question). */
export function mergeTurns(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const blocks = (m: ChatMessage) => typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
  for (const m of messages) {
    const last = out.at(-1);
    if (last && last.role === m.role) {
      out[out.length - 1] = { role: m.role, content: [...blocks(last), ...blocks(m)] } as ChatMessage;
    } else out.push(m);
  }
  return out;
}
