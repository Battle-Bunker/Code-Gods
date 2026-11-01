/**
 * The scripted mock ChatProvider: offline, deterministic, free. The engine selects it only when AI_MOCK=1
 * (local deployments), so the `/mock` syntax below is never parsed in production.
 *
 * The latest user message of the conversation (the one that started the turn; not a tool-result message) picks the
 * script from its last text block (earlier blocks, such as the engine's briefing, are its context):
 *   `/mock {"steps":[step, …]}` or `/mock [step, …]`, where a step is one model call:
 *     { "text": "…" | ["chunk", …], "delayMs": 0..60000 (before each chunk), "tools": [{"name", "input"}], "fail": "message",
 *       "status": 400..599 (with fail: the HTTP status of a provider SDK error, as when the request is refused),
 *       "echo": true (answer with JSON {system, tools: names, context: the prompt's other text blocks, earlier: earlier
 *       turns' user text without their briefings}) }
 *   anything else runs the default script: call get_observation, then summarize it.
 * The step index is the number of assistant messages after that user message. Past the last step the mock ends
 * the turn with no text. Usage is reported from the request and answer sizes (about four characters a token). An aborted
 * stream reports its input usage and the characters it streamed (ChatAbortedError), as the Anthropic adapter does.
 */
import { z } from "zod";
import { CHARS_PER_TOKEN, ChatAbortedError, charsEstimate, inputChars, type ChatMessage, type ChatProvider, type ChatRequest, type ChatResult } from "./chat.ts";

const stepSchema = z.object({
  text: z.union([z.string(), z.array(z.string())]).optional().transform(t => t === undefined ? [] : typeof t === "string" ? [t] : t),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  tools: z.array(z.object({ name: z.string().min(1).max(64), input: z.record(z.unknown()).default({}) }).strict()).max(8).default([]),
  fail: z.string().max(500).optional(),
  status: z.number().int().min(400).max(599).optional(),
  echo: z.boolean().optional(),
  cache: z.object({ read: z.number().min(0).max(1).default(0), write: z.number().min(0).max(1).default(0) }).strict().refine(c => c.read + c.write <= 1).optional(),
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

/** Mock prices: the shape of Anthropic's (cache reads 0.1x, writes 1.25x), tiny. */
const MOCK_PRICES = { inputUsdPerMillion: 0.01, outputUsdPerMillion: 0.01, cacheReadUsdPerMillion: 0.001, cacheWriteUsdPerMillion: 0.0125 };

export function mockChatProvider(): ChatProvider {
  return {
    prices: MOCK_PRICES,
    async estimateInputTokens(input) { return { tokens: charsEstimate(input, CHARS_PER_TOKEN.mock), counted: false }; },
    async stream(request): Promise<ChatResult> {
      let promptAt = -1;
      request.messages.forEach((m, i) => { if (m.role === "user" && (typeof m.content === "string" || !m.content.some(b => b.type === "tool_result"))) promptAt = i; });
      const blocks = promptAt < 0 ? [] : (m => typeof m === "string" ? [m] : m.flatMap(b => b.type === "text" ? [b.text] : []))(request.messages[promptAt].content as ChatMessage["content"]);
      const prompt = blocks.at(-1) ?? "";
      const step = request.messages.slice(promptAt + 1).filter(m => m.role === "assistant").length;
      const script = parseMockScript(prompt);
      const current = script ? script.steps[step] : defaultStep(step, request);
      const inputTokens = Math.ceil(inputChars(request) / CHARS_PER_TOKEN.mock);
      const cacheReadTokens = Math.floor(inputTokens * (current?.cache?.read ?? 0)), cacheWriteTokens = Math.floor(inputTokens * (current?.cache?.write ?? 0));
      const usage = { inputTokens, cacheReadTokens, cacheWriteTokens };
      if (!current) return { content: [], stopReason: "end_turn", ...usage, outputTokens: 1 };
      if (current.fail) throw Object.assign(new Error(current.fail), current.status ? { status: current.status } : {});
      let text = "";
      // Earlier turns' user text (their briefings left out: the current one is in context, and they would crowd the echo).
      const earlier = request.messages.slice(0, Math.max(0, promptAt)).flatMap(m => m.role === "user" ? (typeof m.content === "string" ? [m.content] : m.content.flatMap(b => b.type === "text" && !b.text.startsWith("<briefing>") ? [b.text] : [])) : []);
      const chunks = current.echo ? [JSON.stringify({ system: request.system, tools: request.tools.map(t => t.name), context: blocks.slice(0, -1), earlier })] : current.text;
      const aborted = () => new ChatAbortedError({ input: usage, outputChars: text.length, reasoningMs: 0 });
      for (const chunk of chunks) {
        if (current.delayMs) await sleep(current.delayMs, request.signal).catch(() => { throw aborted(); });
        if (request.signal.aborted) throw aborted();
        text += chunk;
        request.onText?.(chunk);
      }
      if (request.signal.aborted) throw aborted();
      const content: ChatResult["content"] = text ? [{ type: "text", text }] : [];
      current.tools.forEach((t, i) => content.push({ type: "tool_use", id: `mock_${step}_${i}`, name: t.name, input: t.input }));
      const outputTokens = Math.min(request.maxOutputTokens, Math.ceil(JSON.stringify(content).length / 4) + 1);
      return { content, stopReason: current.tools.length ? "tool_use" : "end_turn", ...usage, outputTokens };
    },
  };
}
