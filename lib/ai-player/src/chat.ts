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
  /** A stable, opaque key of the conversation (OpenAI routes requests with one key to the same prompt cache). */
  cacheKey?: string;
  messages: ChatMessage[];
  tools: ChatToolSpec[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Called with each streamed text delta, in order. */
  onText?: (delta: string) => void;
}
/**
 * Provider usage of one model call. `inputTokens` is every input token of the request; `cacheReadTokens` and
 * `cacheWriteTokens` are the parts of it read from and written to the provider's prompt cache (priced differently).
 */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
export interface ChatResult extends ChatUsage {
  /** The model's blocks in order, reasoning included: append them unchanged as the next assistant message. */
  content: ChatAssistantBlock[];
  stopReason: "end_turn" | "tool_use";
}
/** What a request will read: the parts that decide its input size. */
export type ChatInput = Pick<ChatRequest, "system" | "messages" | "tools">;
export interface ChatProvider {
  /** The prices this provider bills at (USD per million tokens). */
  readonly prices: Prices;
  /**
   * The request's input tokens: the provider's own count where it has one (Anthropic count_tokens), else the request
   * size divided by the provider's measured characters per token. Never throws; `counted` says which.
   */
  estimateInputTokens(input: ChatInput, signal?: AbortSignal): Promise<{ tokens: number; counted: boolean }>;
  stream(request: ChatRequest): Promise<ChatResult>;
}

export const MAX_CHAT_OUTPUT_TOKENS = 8192;
/**
 * Prices in USD per million tokens. Cache prices default to the input price (a provider without a prompt cache).
 * Anthropic: reads 0.1x input (0.05x on Claude Opus 5.5), 5-minute writes 1.25x; OpenAI: reads 0.25x, no write premium.
 */
export type Prices = { inputUsdPerMillion: number; outputUsdPerMillion: number; cacheReadUsdPerMillion?: number; cacheWriteUsdPerMillion?: number };

export function checkPrices(model: string, prices: Prices) {
  if (!model || [prices.inputUsdPerMillion, prices.outputUsdPerMillion].some(v => !Number.isFinite(v) || v <= 0) ||
      [prices.cacheReadUsdPerMillion, prices.cacheWriteUsdPerMillion].some(v => v !== undefined && (!Number.isFinite(v) || v <= 0))) {
    throw new Error("Vetted model and price ceilings required");
  }
}
const readPrice = (p: Prices) => p.cacheReadUsdPerMillion ?? p.inputUsdPerMillion;
const writePrice = (p: Prices) => p.cacheWriteUsdPerMillion ?? p.inputUsdPerMillion;
const dearestInput = (p: Prices) => Math.max(p.inputUsdPerMillion, writePrice(p));

/**
 * What one call costs: USD at the provider's prices, and the allowance tokens it uses. Allowance tokens are
 * input-price-equivalent: an uncached input or an output token counts 1, a cache read counts its price relative to
 * the input price (0.1 at Anthropic, 0.25 at OpenAI), a cache write likewise (1.25 at Anthropic). Rounded up.
 */
export function usageCost(prices: Prices, u: ChatUsage): { usd: number; tokens: number } {
  const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  const usd = (uncached * prices.inputUsdPerMillion + u.cacheReadTokens * readPrice(prices) + u.cacheWriteTokens * writePrice(prices) +
    u.outputTokens * prices.outputUsdPerMillion) / 1_000_000;
  const relative = (tokens: number, price: number) => Math.ceil(tokens * price / prices.inputUsdPerMillion);
  return { usd, tokens: uncached + relative(u.cacheReadTokens, readPrice(prices)) + relative(u.cacheWriteTokens, writePrice(prices)) + u.outputTokens };
}
/** The worst case of a call (every input token written to the cache, if that is dearer; the whole output ceiling). */
export function worstCaseCost(prices: Prices, inputTokens: number, outputTokens: number): { usd: number; tokens: number } {
  return { usd: (inputTokens * dearestInput(prices) + outputTokens * prices.outputUsdPerMillion) / 1_000_000, tokens: Math.ceil(inputTokens * dearestInput(prices) / prices.inputUsdPerMillion) + outputTokens };
}

/** The size the characters-per-token estimates are measured against: the system prompt, the history and the tools as JSON. */
export const inputChars = (input: ChatInput) => input.system.length + JSON.stringify(input.messages).length + JSON.stringify(input.tools).length;
/**
 * Characters of `inputChars` per input token, measured from live usage (test/chat-cost.test.ts keeps the samples)
 * and rounded down so an estimate errs high: claude-sonnet-5-5 2.65–2.70 (tool schemas and JSON-escaped history
 * tokenize densely; Anthropic counts with count_tokens when it can), gpt-4.1-mini 4.3–4.6.
 */
export const CHARS_PER_TOKEN = { anthropic: 2.5, openai: 4.0, mock: 4 } as const;
export const charsEstimate = (input: ChatInput, charsPerToken: number) => Math.ceil(inputChars(input) / charsPerToken);
/** The input tokens a step reserves for: the estimate with a margin (a provider count is near exact; a ratio less so). */
export const inputReservation = (estimate: { tokens: number; counted: boolean }) => Math.ceil(estimate.tokens * (estimate.counted ? 1.05 : 1.1)) + 64;
/** Output characters (text, tool arguments) per token, low so a cancelled step's estimate errs high. */
export const OUTPUT_CHARS_PER_TOKEN = 2.5;
/** An upper bound on any catalogued model's output speed, for reasoning the provider does not show (tokens per second). */
export const MAX_OUTPUT_TOKENS_PER_SECOND = 400;

/**
 * A stream the caller aborted, with what is known of what it cost so far: the input usage if the provider reported
 * it before the abort, the characters of text and tool arguments streamed, and how long hidden reasoning ran.
 */
export class ChatAbortedError extends Error {
  constructor(readonly partial: { input?: Omit<ChatUsage, "outputTokens">; outputChars: number; reasoningMs: number }) {
    super("The model call was cancelled");
    this.name = "ChatAbortedError";
  }
}
/**
 * The best known output tokens of an aborted stream: the streamed characters' tokens plus hidden reasoning at most at
 * MAX_OUTPUT_TOKENS_PER_SECOND for as long as it ran, never more than the ceiling.
 */
export function abortedOutputTokens(partial: ChatAbortedError["partial"], maxOutputTokens: number): number {
  const visible = Math.ceil(partial.outputChars / OUTPUT_CHARS_PER_TOKEN) + (partial.outputChars > 0 ? 8 : 0);
  return Math.min(maxOutputTokens, visible + Math.ceil(partial.reasoningMs / 1000 * MAX_OUTPUT_TOKENS_PER_SECOND));
}

export function checkRequest(request: ChatRequest) {
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > MAX_CHAT_OUTPUT_TOKENS) {
    throw new Error("Invalid AI output token limit");
  }
  request.signal.throwIfAborted();
}

const count = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
/** Provider usage the caller may settle a budget against, or an error. The cache parts are within the input. */
export function checkUsage(inputTokens: unknown, outputTokens: unknown, maxOutputTokens: number, cache: { read?: unknown; write?: unknown } = {}): ChatUsage {
  const read = cache.read ?? 0, write = cache.write ?? 0;
  if (!count(inputTokens) || !count(outputTokens) || (outputTokens as number) > maxOutputTokens || !count(read) || !count(write) ||
      (read as number) + (write as number) > (inputTokens as number)) throw new Error("Invalid or missing provider usage");
  return { inputTokens: inputTokens as number, outputTokens: outputTokens as number, cacheReadTokens: read as number, cacheWriteTokens: write as number };
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

const PALETTE = "until then, the command palette does everything the assistant would";

/**
 * A failed model call as the reason shown to the player, and whether it is known to have cost nothing. A provider SDK
 * error with an HTTP status (OpenAI's and Anthropic's APIError) means the request was refused before any answer
 * streamed, so nothing was billed; an error without one (a stream cut, an incomplete answer) may have been. The
 * operator's account problems (out of credit, a rejected key) are named without the provider's billing links: the
 * player can't fix them.
 */
export function providerFailure(error: unknown): { message: string; unbilled: boolean } {
  const e = (error ?? {}) as { status?: unknown; message?: unknown; error?: unknown };
  const status = typeof e.status === "number" ? e.status : undefined;
  const raw = typeof e.message === "string" ? e.message : String(error);
  const body = JSON.stringify(e.error ?? {});
  const unbilled = status !== undefined;
  if (status === 401 || status === 403) {
    return { unbilled, message: `The assistant's AI provider rejected this server's API key. Whoever runs this server has to fix it; ${PALETTE}.` };
  }
  if ((status === 429 || status === 400 || status === 402) && /insufficient_quota|credit|billing/i.test(`${raw} ${body}`)) {
    return { unbilled, message: `The assistant's AI provider account is out of credit. Whoever runs this server has to top it up; ${PALETTE}.` };
  }
  if (status === 429) return { unbilled, message: "The AI provider is rate-limiting this server right now; try again in a minute." };
  if (status !== undefined && status >= 500) return { unbilled, message: "The AI provider is overloaded or down right now; try again in a few minutes." };
  return { unbilled, message: `The model call failed: ${raw.slice(0, 300)}` };
}
