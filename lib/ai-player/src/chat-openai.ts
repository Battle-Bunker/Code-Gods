/** The OpenAI chat-completions adapter of the assistant's ChatProvider (chat.ts): streaming text and tool calls. */
import OpenAI from "openai";
import {
  CHARS_PER_TOKEN, ChatAbortedError, ChatCutError, activeTools, charsEstimate, checkPrices, checkRequest, checkUsage, completeStop,
  type ChatProvider, type ChatResult, type Prices,
} from "./chat.ts";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function openAIChatProvider(client: OpenAI, model: string, prices: Prices): ChatProvider {
  checkPrices(model, prices);
  return {
    prices,
    async estimateInputTokens(input) { return { tokens: charsEstimate(input, CHARS_PER_TOKEN.openai), counted: false }; },
    /**
     * OpenAI caches stable request prefixes automatically (1024 tokens and up): the tools and the system prompt come
     * first and never change within a thread, then the append-only history; prompt_cache_key (the engine's hash of
     * that prefix) keeps every thread of a player on the same cache. Cached input is reported as prompt_tokens_details.cached_tokens.
     */
    async stream(request) {
      checkRequest(request);
      const messages: Message[] = [{ role: "system", content: request.system }];
      for (const m of request.messages) {
        if (m.role === "assistant") {
          const text = m.content.filter(b => b.type === "text").map(b => b.text).join("");
          const calls = m.content.filter(b => b.type === "tool_use");
          messages.push({ role: "assistant", content: text || null,
            ...(calls.length ? { tool_calls: calls.map(c => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}) });
        } else if (typeof m.content === "string") messages.push({ role: "user", content: m.content });
        else {
          // Tool messages must follow the assistant's tool_calls directly; the user's text (a briefing and its
          // question, or messages queued during the turn after a step's results) follows as one user message.
          for (const b of m.content) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.toolUseId, content: b.content });
          const texts = m.content.flatMap(b => b.type === "text" ? [b.text] : []);
          if (texts.length === 1) messages.push({ role: "user", content: texts[0] });
          else if (texts.length) messages.push({ role: "user", content: texts.map(text => ({ type: "text" as const, text })) });
        }
      }
      const tools = activeTools(request);
      let text = "";
      let finish: string | null = null;
      let usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined;
      const calls: { id: string; name: string; args: string }[] = [];
      try {
        const stream = await client.chat.completions.create({
          model, messages, max_completion_tokens: request.maxOutputTokens, stream: true, stream_options: { include_usage: true },
          // No native deferral on Chat Completions: the tools in context are the core ones plus those the history loaded.
          ...(tools.length ? { tools: tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
          ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
        }, { signal: request.signal, maxRetries: 0 });
        for await (const chunk of stream) {
          if (chunk.usage) usage = chunk.usage;
          const choice = chunk.choices[0];
          if (!choice) continue;
          if (choice.delta?.content) { text += choice.delta.content; request.onText?.(choice.delta.content); }
          for (const call of choice.delta?.tool_calls ?? []) {
            const slot = calls[call.index] ??= { id: "", name: "", args: "" };
            if (call.id) slot.id = call.id;
            if (call.function?.name) slot.name += call.function.name;
            if (call.function?.arguments) slot.args += call.function.arguments;
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }
      } catch (error) {
        if (!request.signal.aborted) throw error;
      }
      // Usage arrives only in the last chunk: an aborted stream (the SDK may end it quietly) knows only what it
      // streamed; this API shows no hidden reasoning.
      if (request.signal.aborted && !(finish && usage)) throw new ChatAbortedError({ outputChars: text.length + calls.reduce((n, c) => n + c.args.length, 0), reasoningMs: 0 });
      const counted = checkUsage(usage?.prompt_tokens, usage?.completion_tokens, request.maxOutputTokens, { read: usage?.prompt_tokens_details?.cached_tokens ?? 0 });
      if (finish === "length") throw new ChatCutError(counted);
      const stopReason = completeStop(finish, { stop: "end_turn", tool_calls: "tool_use" });
      const content: ChatResult["content"] = text ? [{ type: "text", text }] : [];
      for (const call of calls) {
        let input: unknown;
        try { input = JSON.parse(call.args || "{}"); } catch { throw new Error("Invalid tool arguments from the model"); }
        if (!input || typeof input !== "object" || Array.isArray(input) || !call.id || !call.name) throw new Error("Invalid tool arguments from the model");
        content.push({ type: "tool_use", id: call.id, name: call.name, input: input as Record<string, unknown> });
      }
      return { content, stopReason, ...counted };
    },
  };
}

/** Server-only factory; never inherits a proxy base URL from the environment; no retries. */
export function createDirectOpenAIChatProvider(apiKey: string, model: string, prices: Prices): ChatProvider {
  if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required");
  return openAIChatProvider(new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 120_000 }), model, prices);
}
