/** The Anthropic Messages adapter of the assistant's ChatProvider (chat.ts): streaming text, tool use and adaptive thinking. */
import Anthropic from "@anthropic-ai/sdk";
import {
  CHARS_PER_TOKEN, ChatAbortedError, charsEstimate, checkPrices, checkRequest, checkUsage, completeStop, mergeTurns,
  type ChatInput, type ChatMessage, type ChatProvider, type ChatResult, type ChatUsage, type Prices,
} from "./chat.ts";

type Config = { model: string } & Prices;

/** Assistant thinking at a moderate depth: enough to write agents, cheap enough for chat. */
const THINKING = { thinking: { type: "adaptive" as const }, output_config: { effort: "medium" as const } };

function toParams(messages: ChatMessage[], keepThinking: boolean): Anthropic.MessageParam[] {
  return mergeTurns(messages).map(m => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.flatMap(b =>
      b.type === "tool_result" ? [{ type: "tool_result" as const, tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) }]
      : b.type === "tool_use" ? [{ type: "tool_use" as const, id: b.id, name: b.name, input: b.input }]
      : b.type === "thinking" ? (keepThinking && b.provider === "anthropic" ? [b.block] : [])
      : [{ type: "text" as const, text: b.text }]),
  })) as Anthropic.MessageParam[];
}

/**
 * Prompt caching (5-minute entries): an explicit breakpoint on the system prompt caches the tools and the system
 * prompt (rendered before it), which every step and turn of a thread shares; top-level automatic caching puts a
 * second breakpoint on the conversation's last block, so the next step of the turn reads the whole history so far.
 */
const CACHE = { type: "ephemeral" as const };
const systemBlocks = (system: string): Anthropic.TextBlockParam[] => [{ type: "text", text: system, cache_control: CACHE }];
const toolParams = (input: ChatInput): Anthropic.Tool[] =>
  input.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }));

/** A 400 about replayed thinking blocks (a changed prefix or another model's signature): decided before any output. */
const rejectsThinking = (error: unknown) => error instanceof Anthropic.BadRequestError && /signature/i.test(error.message) && /thinking/i.test(error.message);

export function anthropicChatProvider(client: Pick<Anthropic, "messages">, config: Config): ChatProvider {
  checkPrices(config.model, config);
  const { model, ...prices } = config;
  return {
    prices,
    async estimateInputTokens(input, signal) {
      try {
        const counted = await client.messages.countTokens({
          model, system: systemBlocks(input.system), messages: toParams(input.messages, true), tools: toolParams(input), ...THINKING,
        }, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000), maxRetries: 0 });
        if (Number.isSafeInteger(counted.input_tokens) && counted.input_tokens > 0) return { tokens: counted.input_tokens, counted: true };
      } catch { /* the estimate below */ }
      return { tokens: charsEstimate(input, CHARS_PER_TOKEN.anthropic), counted: false };
    },
    async stream(request) {
      checkRequest(request);
      const hasThinking = request.messages.some(m => m.role === "assistant" && m.content.some(b => b.type === "thinking"));
      // What an aborted stream is known to have cost: its input usage (message_start), the characters streamed, and
      // how long hidden reasoning ran (thinking is billed in full but streams nothing or a summary).
      let input: Omit<ChatUsage, "outputTokens"> | undefined, outputChars = 0, reasoningMs = 0, reasoningSince: number | null = null;
      const attempt = async (keepThinking: boolean) => {
        const stream = client.messages.stream({
          model, max_tokens: request.maxOutputTokens, system: systemBlocks(request.system), messages: toParams(request.messages, keepThinking),
          tools: toolParams(request), cache_control: CACHE, ...THINKING,
        }, { signal: request.signal, maxRetries: 0 });
        stream.on("streamEvent", event => {
          if (event.type === "message_start") {
            const u = event.message.usage;
            const read = u.cache_read_input_tokens ?? 0, write = u.cache_creation_input_tokens ?? 0;
            input = { inputTokens: u.input_tokens + read + write, cacheReadTokens: read, cacheWriteTokens: write };
          } else if (event.type === "content_block_start" && (event.content_block.type === "thinking" || event.content_block.type === "redacted_thinking")) {
            reasoningSince = Date.now();
          } else if (event.type === "content_block_stop" && reasoningSince !== null) {
            reasoningMs += Date.now() - reasoningSince;
            reasoningSince = null;
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") outputChars += event.delta.text.length;
            else if (event.delta.type === "input_json_delta") outputChars += event.delta.partial_json.length;
          }
        });
        if (request.onText) stream.on("text", delta => request.onText!(delta));
        return stream.finalMessage();
      };
      const aborted = () => new ChatAbortedError({ ...(input ? { input } : {}), outputChars, reasoningMs: reasoningMs + (reasoningSince !== null ? Date.now() - reasoningSince : 0) });
      let message: Anthropic.Message;
      try { message = await attempt(true); } catch (error) {
        if (request.signal.aborted) throw aborted();
        // The one retry: a rejected thinking replay fails before any output (unbilled); the turn goes on without it.
        if (!hasThinking || !rejectsThinking(error)) throw error;
        try { message = await attempt(false); } catch (retryError) { throw request.signal.aborted ? aborted() : retryError; }
      }
      const stopReason = completeStop(message.stop_reason, { end_turn: "end_turn", tool_use: "tool_use" });
      const usage = message.usage;
      const read = usage.cache_read_input_tokens ?? 0, write = usage.cache_creation_input_tokens ?? 0;
      const counted = checkUsage(usage.input_tokens + read + write, usage.output_tokens, request.maxOutputTokens, { read, write });
      const content: ChatResult["content"] = [];
      for (const block of message.content) {
        if (block.type === "text") { if (block.text) content.push({ type: "text", text: block.text }); }
        else if (block.type === "thinking") content.push({ type: "thinking", provider: "anthropic", block: { type: "thinking", thinking: block.thinking, signature: block.signature } });
        else if (block.type === "redacted_thinking") content.push({ type: "thinking", provider: "anthropic", block: { type: "redacted_thinking", data: block.data } });
        else if (block.type === "tool_use") {
          const input = block.input && typeof block.input === "object" && !Array.isArray(block.input) ? block.input as Record<string, unknown> : null;
          if (!input) throw new Error("Invalid tool arguments from the model");
          content.push({ type: "tool_use", id: block.id, name: block.name, input });
        } else throw new Error(`Unsupported Anthropic content block: ${block.type}`);
      }
      return { content, stopReason, ...counted };
    },
  };
}

/** Server-only factory: the explicit direct endpoint prevents an environment-selected proxy; no retries. */
export function createDirectAnthropicChatProvider(apiKey: string, config: Config): ChatProvider {
  if (!apiKey.trim()) throw new Error("ANTHROPIC_API_KEY is required");
  return anthropicChatProvider(new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 120_000 }), config);
}
