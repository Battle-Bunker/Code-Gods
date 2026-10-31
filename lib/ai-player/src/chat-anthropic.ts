/** The Anthropic Messages adapter of the assistant's ChatProvider (chat.ts): streaming text, tool use and adaptive thinking. */
import Anthropic from "@anthropic-ai/sdk";
import { checkPrices, checkRequest, checkUsage, completeStop, mergeTurns, usdEstimator, type ChatMessage, type ChatProvider, type ChatResult } from "./chat.ts";

type Config = { model: string; inputUsdPerMillion: number; outputUsdPerMillion: number };

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

/** A 400 about replayed thinking blocks (a changed prefix or another model's signature): decided before any output. */
const rejectsThinking = (error: unknown) => error instanceof Anthropic.BadRequestError && /signature/i.test(error.message) && /thinking/i.test(error.message);

export function anthropicChatProvider(client: Pick<Anthropic, "messages">, config: Config): ChatProvider {
  checkPrices(config.model, config);
  return {
    estimateMaxUsd: usdEstimator(config),
    async stream(request) {
      checkRequest(request);
      const hasThinking = request.messages.some(m => m.role === "assistant" && m.content.some(b => b.type === "thinking"));
      const attempt = async (keepThinking: boolean) => {
        const stream = client.messages.stream({
          model: config.model, max_tokens: request.maxOutputTokens, system: request.system, messages: toParams(request.messages, keepThinking),
          tools: request.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
          ...THINKING,
          // No prompt caching or other separately billed features.
        }, { signal: request.signal, maxRetries: 0 });
        if (request.onText) stream.on("text", delta => request.onText!(delta));
        return stream.finalMessage();
      };
      let message: Anthropic.Message;
      try { message = await attempt(true); } catch (error) {
        // The one retry: a rejected thinking replay fails before any output (unbilled); the turn goes on without it.
        if (!hasThinking || !rejectsThinking(error) || request.signal.aborted) throw error;
        message = await attempt(false);
      }
      const stopReason = completeStop(message.stop_reason, { end_turn: "end_turn", tool_use: "tool_use" });
      const usage = message.usage;
      const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      const counted = checkUsage(input, usage.output_tokens, request.maxOutputTokens);
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
