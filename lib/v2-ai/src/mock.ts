/**
 * The scripted mock provider: offline, deterministic, nearly free. A host selects it only in local and test runs.
 *
 * The script is `mockProvider(steps)`'s, else the latest prompt's (the last user message that is not tool results)
 * when its last text block is `/mock [step, …]` or `/mock {"steps": [step, …]}`, else the default script (read the
 * game with game_get when it is offered, then summarize). A step is one model call:
 *   { "text": "…", "tools": [{ "name": "agent_check", "input": {…} }], "fail": "message", "status": 400..599 }
 * The step index is the number of assistant messages after the latest prompt; past the last step the mock ends the
 * turn with no text. Tool-use ids are `mock_<step>_<i>`. Usage is the request and answer sizes at four characters a token.
 */
import { z } from "zod/v4";
import { ChatError, type AssistantBlock, type ChatMessage, type ChatProvider, type ChatRequest, type ChatStep } from "./chat.ts";

const stepSchema = z.strictObject({
  text: z.string().max(10_000).optional(),
  tools: z.array(z.strictObject({ name: z.string().min(1).max(64), input: z.record(z.string(), z.unknown()).default({}) })).max(8).default([]),
  fail: z.string().max(500).optional(),
  status: z.number().int().min(400).max(599).optional(),
});
export type MockStep = z.input<typeof stepSchema>;
const scriptSchema = z.array(stepSchema).max(20);

/** The script of a `/mock …` text, null for any other text; throws on a malformed script. */
export function parseMockScript(text: string): z.output<typeof stepSchema>[] | null {
  if (!/^\/mock(\s|$)/.test(text)) return null;
  let json: unknown;
  try { json = JSON.parse(text.slice(5).trim() || "[]"); } catch { throw new Error("Invalid mock script: not JSON"); }
  const steps = Array.isArray(json) ? json : (json as { steps?: unknown } | null)?.steps;
  const parsed = scriptSchema.safeParse(steps);
  if (!parsed.success) throw new Error(`Invalid mock script: ${z.prettifyError(parsed.error)}`.slice(0, 400));
  return parsed.data;
}

function promptIndex(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && (typeof m.content === "string" || !m.content.some(b => b.type === "tool_result"))) return i;
  }
  return -1;
}
const lastText = (m: ChatMessage | undefined) =>
  !m ? "" : typeof m.content === "string" ? m.content : m.content.flatMap(b => b.type === "text" ? [b.text] : []).at(-1) ?? "";

function defaultStep(step: number, request: ChatRequest): z.output<typeof stepSchema> | undefined {
  const canRead = request.tools.some(t => t.name === "game_get");
  if (step === 0 && canRead) return { text: "Let me look at your game.", tools: [{ name: "game_get", input: {} }] };
  if (step === 0 || (step === 1 && canRead)) return { text: "Mock summary: nothing to report.", tools: [] };
  return undefined;
}

/** Mock prices: Anthropic's shape, tiny. */
export const MOCK_PRICES = Object.freeze({ input: 0.01, output: 0.01 });

export function mockProvider(script?: readonly MockStep[]): ChatProvider {
  const fixed = script ? scriptSchema.parse(script) : undefined;
  return {
    model: "mock", prices: MOCK_PRICES,
    async step(request): Promise<ChatStep> {
      const at = promptIndex(request.messages);
      const step = request.messages.slice(at + 1).filter(m => m.role === "assistant").length;
      const steps = fixed ?? parseMockScript(lastText(request.messages[at]));
      const current = steps ? steps[step] : defaultStep(step, request);
      const inputTokens = Math.ceil((request.system.length + JSON.stringify(request.messages).length + JSON.stringify(request.tools).length) / 4);
      if (current?.fail) throw new ChatError(current.fail, undefined, current.status);
      const content: AssistantBlock[] = current?.text ? [{ type: "text", text: current.text }] : [];
      (current?.tools ?? []).forEach((t, i) => content.push({ type: "tool_use", id: `mock_${step}_${i}`, name: t.name, input: t.input }));
      const outputTokens = Math.min(request.maxOutputTokens, Math.ceil(JSON.stringify(content).length / 4) + 1);
      return {
        content, stop: content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn",
        usage: { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
}
