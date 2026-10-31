/**
 * The scripted mock ChatProvider: offline, deterministic, free. The engine selects it only when AI_MOCK=1
 * (local deployments), so the `/mock` syntax below is never parsed in production.
 *
 * The latest user message of the conversation (the one that started the turn; not a tool-result message) picks the
 * script from its last text block (earlier blocks, such as the engine's briefing, are its context):
 *   `/mock {"steps":[step, …]}` or `/mock [step, …]`, where a step is one model call:
 *     { "text": "…" | ["chunk", …], "delayMs": 0..60000 (before each chunk), "tools": [{"name", "input"}], "fail": "message",
 *       "echo": true (answer with JSON {system, tools: names, context: the prompt's other text blocks}) }
 *   anything else runs the default script: call get_observation, then summarize it.
 * The step index is the number of assistant messages after that user message. Past the last step the mock ends
 * the turn with no text. Usage is reported from the request and answer sizes (about four characters a token).
 */
import { z } from "zod";
import type { ChatMessage, ChatProvider, ChatRequest, ChatResult } from "./chat.ts";

const stepSchema = z.object({
  text: z.union([z.string(), z.array(z.string())]).optional().transform(t => t === undefined ? [] : typeof t === "string" ? [t] : t),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  tools: z.array(z.object({ name: z.string().min(1).max(64), input: z.record(z.unknown()).default({}) }).strict()).max(8).default([]),
  fail: z.string().max(500).optional(),
  echo: z.boolean().optional(),
}).strict();
const scriptSchema = z.object({ steps: z.array(stepSchema).max(20) }).strict();
export type MockStep = z.output<typeof stepSchema>;
export type MockScript = { steps: MockStep[] };

/** The script of a `/mock …` message, null for any other text; throws on a malformed script. */
export function parseMockScript(text: string): MockScript | null {
  if (!/^\/mock(\s|$)/.test(text)) return null;
  let json: unknown;
  try { json = JSON.parse(text.slice(5).trim() || "{}"); } catch { throw new Error("Invalid mock script: not JSON"); }
  const parsed = scriptSchema.safeParse(Array.isArray(json) ? { steps: json } : json);
  if (!parsed.success) throw new Error(`Invalid mock script: ${parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`.slice(0, 400));
  return parsed.data;
}

/** The default script: read the observation, then summarize what it says. */
function defaultStep(step: number, request: ChatRequest): MockStep {
  if (step === 0) return { text: ["Let me look at your game."], delayMs: 0, tools: [{ name: "get_observation", input: { objectsLimit: 5 } }] };
  const last = request.messages.at(-1);
  const result = last?.role === "user" && typeof last.content !== "string" ? last.content.find(b => b.type === "tool_result") : undefined;
  let data: { phase?: string; objectCount?: number; self?: { energy?: number } } = {};
  try { data = (JSON.parse(result?.type === "tool_result" ? result.content : "{}") as { data?: typeof data }).data ?? {}; } catch { /* keep empty */ }
  return { text: [`Mock summary: phase ${data.phase ?? "unknown"}, ${data.objectCount ?? 0} objects, energy ${data.self?.energy ?? "unknown"}.`], delayMs: 0, tools: [] };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Mock stream aborted"));
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new Error("Mock stream aborted")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function mockChatProvider(): ChatProvider {
  return {
    estimateMaxUsd: (input, output) => (input + output) * 1e-8,
    async stream(request): Promise<ChatResult> {
      let promptAt = -1;
      request.messages.forEach((m, i) => { if (m.role === "user" && (typeof m.content === "string" || !m.content.some(b => b.type === "tool_result"))) promptAt = i; });
      const blocks = promptAt < 0 ? [] : (m => typeof m === "string" ? [m] : m.flatMap(b => b.type === "text" ? [b.text] : []))(request.messages[promptAt].content as ChatMessage["content"]);
      const prompt = blocks.at(-1) ?? "";
      const step = request.messages.slice(promptAt + 1).filter(m => m.role === "assistant").length;
      const script = parseMockScript(prompt);
      const current = script ? script.steps[step] : defaultStep(step, request);
      const inputTokens = Math.ceil(JSON.stringify({ system: request.system, messages: request.messages, tools: request.tools }).length / 4);
      if (!current) return { content: [], stopReason: "end_turn", inputTokens, outputTokens: 1 };
      if (current.fail) throw new Error(current.fail);
      let text = "";
      const chunks = current.echo ? [JSON.stringify({ system: request.system, tools: request.tools.map(t => t.name), context: blocks.slice(0, -1) })] : current.text;
      for (const chunk of chunks) {
        if (current.delayMs) await sleep(current.delayMs, request.signal);
        if (request.signal.aborted) throw new Error("Mock stream aborted");
        text += chunk;
        request.onText?.(chunk);
      }
      request.signal.throwIfAborted();
      const content: ChatResult["content"] = text ? [{ type: "text", text }] : [];
      current.tools.forEach((t, i) => content.push({ type: "tool_use", id: `mock_${step}_${i}`, name: t.name, input: t.input }));
      const outputTokens = Math.min(request.maxOutputTokens, Math.ceil(JSON.stringify(content).length / 4) + 1);
      return { content, stopReason: current.tools.length ? "tool_use" : "end_turn", inputTokens, outputTokens };
    },
  };
}
