/** The OpenAI chat-completions adapter of the assistant's ChatProvider (chat.ts): streaming text and tool calls. */
import OpenAI from "openai";
import { checkPrices, checkRequest, checkUsage, completeStop, usdEstimator, type ChatProvider, type ChatResult } from "./chat.ts";

type Prices = { inputUsdPerMillion: number; outputUsdPerMillion: number };
type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function openAIChatProvider(client: OpenAI, model: string, prices: Prices): ChatProvider {
  checkPrices(model, prices);
  return {
    estimateMaxUsd: usdEstimator(prices),
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
          for (const b of m.content) {
            if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.toolUseId, content: b.content });
            else messages.push({ role: "user", content: b.text });
          }
        }
      }
      const stream = await client.chat.completions.create({
        model, messages, max_completion_tokens: request.maxOutputTokens, stream: true, stream_options: { include_usage: true },
        ...(request.tools.length ? { tools: request.tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
      }, { signal: request.signal, maxRetries: 0 });
      let text = "";
      let finish: string | null = null;
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      const calls: { id: string; name: string; args: string }[] = [];
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
      const stopReason = completeStop(finish, { stop: "end_turn", tool_calls: "tool_use" });
      const counted = checkUsage(usage?.prompt_tokens, usage?.completion_tokens, request.maxOutputTokens);
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
