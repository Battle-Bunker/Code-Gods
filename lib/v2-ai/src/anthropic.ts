/** The Anthropic Messages adapter (POST /v1/messages over fetch): tool use, adaptive thinking, prompt caching. */
import {
  ChatError, checkPrices, checkRequest, checkUsage, mergeTurns, postJson,
  type AssistantBlock, type ChatMessage, type ChatProvider, type Prices,
} from "./chat.ts";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  prices: Prices;
  /** Thinking depth; the model thinks adaptively at this effort. Default "medium": enough to write agents, cheap enough for chat. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * Server-side refusal fallback (default on): a declined request is re-run on a fallback model the API chooses by
   * the refusal's category. The rescue is billed at that model's rates, which the usage here prices at `prices`.
   */
  fallbacks?: boolean;
  /** For tests only. */
  endpoint?: string;
}

const CACHE = { type: "ephemeral" } as const;

function toParams(messages: readonly ChatMessage[]) {
  return mergeTurns(messages).map(m => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.flatMap(b =>
      b.type === "tool_result" ? [{ type: "tool_result", tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) }]
      : b.type === "tool_use" ? [{ type: "tool_use", id: b.id, name: b.name, input: b.input }]
      : b.type === "thinking" ? (b.provider === "anthropic" ? [b.block] : [])
      : [{ type: "text", text: b.text }]),
  }));
}

export function anthropicProvider(config: AnthropicConfig): ChatProvider {
  checkPrices(config.model, config.prices);
  if (!config.apiKey.trim()) throw new Error("An Anthropic API key is required");
  const { model, prices } = config;
  const fallbacks = config.fallbacks ?? true;
  const headers: Record<string, string> = {
    "x-api-key": config.apiKey, "anthropic-version": "2023-06-01",
    ...(fallbacks ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
  };
  return {
    model, prices,
    async step(request) {
      checkRequest(request);
      // The system prompt's breakpoint caches the tools and the system prompt (rendered before it), which every step
      // shares; top-level automatic caching adds one on the conversation's last block for the next step.
      const json = await postJson(config.endpoint ?? "https://api.anthropic.com/v1/messages", headers, {
        model, max_tokens: request.maxOutputTokens,
        system: [{ type: "text", text: request.system, cache_control: CACHE }],
        messages: toParams(request.messages),
        ...(request.tools.length ? { tools: request.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })) } : {}),
        cache_control: CACHE,
        output_config: { effort: config.effort ?? "medium" },
        ...(fallbacks ? { fallbacks: "default" } : {}),
      }, request.signal);
      const u = (json.usage ?? {}) as Record<string, unknown>;
      const read = u.cache_read_input_tokens ?? 0, write = u.cache_creation_input_tokens ?? 0;
      const usage = checkUsage((u.input_tokens as number) + (read as number) + (write as number), u.output_tokens, request.maxOutputTokens, read, write);
      const stop = json.stop_reason;
      if (stop !== "end_turn" && stop !== "tool_use") throw new ChatError(`Incomplete model answer (stop: ${String(stop)})`, usage);
      const content: AssistantBlock[] = [];
      for (const block of (json.content ?? []) as Record<string, unknown>[]) {
        if (block.type === "text") { if (typeof block.text === "string" && block.text) content.push({ type: "text", text: block.text }); }
        else if (block.type === "thinking" || block.type === "redacted_thinking") content.push({ type: "thinking", provider: "anthropic", block });
        else if (block.type === "tool_use") {
          const input = block.input;
          if (!input || typeof input !== "object" || Array.isArray(input) || typeof block.id !== "string" || typeof block.name !== "string") {
            throw new ChatError("Invalid tool arguments from the model", usage);
          }
          content.push({ type: "tool_use", id: block.id, name: block.name, input: input as Record<string, unknown> });
        }
        else if (block.type === "fallback") continue; // where a refusal handed over to the fallback model
        else throw new ChatError(`Unsupported content block: ${String(block.type)}`, usage);
      }
      return { content, stop, usage };
    },
  };
}
