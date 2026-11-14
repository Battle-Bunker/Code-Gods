/** The OpenAI chat-completions adapter (POST /v1/chat/completions over fetch): text and tool calls. */
import {
  ChatError, checkPrices, checkRequest, checkUsage, postJson,
  type AssistantBlock, type ChatProvider, type Prices,
} from "./chat.ts";

export interface OpenAIConfig { apiKey: string; model: string; prices: Prices; /** For tests only. */ endpoint?: string }

type Message = Record<string, unknown>;

export function openAIProvider(config: OpenAIConfig): ChatProvider {
  checkPrices(config.model, config.prices);
  if (!config.apiKey.trim()) throw new Error("An OpenAI API key is required");
  const { model, prices } = config;
  return {
    model, prices,
    async step(request) {
      checkRequest(request);
      const messages: Message[] = [{ role: "system", content: request.system }];
      for (const m of request.messages) {
        if (m.role === "assistant") {
          const text = m.content.flatMap(b => b.type === "text" ? [b.text] : []).join("");
          const calls = m.content.flatMap(b => b.type === "tool_use" ? [b] : []);
          messages.push({ role: "assistant", content: text || null,
            ...(calls.length ? { tool_calls: calls.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}) });
        } else if (typeof m.content === "string") messages.push({ role: "user", content: m.content });
        else {
          // Tool messages follow the assistant's tool_calls directly; the user's text follows as one user message.
          for (const b of m.content) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.toolUseId, content: b.content });
          const texts = m.content.flatMap(b => b.type === "text" ? [b.text] : []);
          if (texts.length) messages.push({ role: "user", content: texts.join("\n\n") });
        }
      }
      const json = await postJson(config.endpoint ?? "https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${config.apiKey}` }, {
        model, messages, max_completion_tokens: request.maxOutputTokens,
        ...(request.tools.length ? { tools: request.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
      }, request.signal);
      const u = (json.usage ?? {}) as { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } };
      const usage = checkUsage(u.prompt_tokens, u.completion_tokens, request.maxOutputTokens, u.prompt_tokens_details?.cached_tokens ?? 0);
      const choice = ((json.choices ?? []) as { finish_reason?: string; message?: { content?: string | null; refusal?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[])[0];
      const finish = choice?.finish_reason;
      if (choice?.message?.refusal || (finish !== "stop" && finish !== "tool_calls")) throw new ChatError(`Incomplete model answer (stop: ${finish ?? "none"})`, usage);
      const content: AssistantBlock[] = choice.message?.content ? [{ type: "text", text: choice.message.content }] : [];
      for (const call of choice.message?.tool_calls ?? []) {
        let input: unknown;
        try { input = JSON.parse(call.function?.arguments || "{}"); } catch { input = null; }
        if (!input || typeof input !== "object" || Array.isArray(input) || !call.id || !call.function?.name) throw new ChatError("Invalid tool arguments from the model", usage);
        content.push({ type: "tool_use", id: call.id, name: call.function.name, input: input as Record<string, unknown> });
      }
      return { content, stop: finish === "tool_calls" ? "tool_use" : "end_turn", usage };
    },
  };
}
