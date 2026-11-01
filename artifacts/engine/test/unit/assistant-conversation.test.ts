/**
 * The assistant's conversation loop end to end without a backend: the real Anthropic adapter (lib/ai-player) and the
 * engine's history (rules.ts buildHistory, prepareArgs) against a stand-in Messages API that behaves like Claude 5
 * models: every answer starts with a thinking block whose signature binds the system prompt, the tools and every
 * message before it, and a replayed block whose prefix changed is a 400 (preserved thinking).
 *
 * What would break: "Unsupported Anthropic content block: thinking" (the screenshot's "Suggest an opening agent"
 * turn), and any edit of the history between steps of a turn (a moving cut, rebuilt tool input with derived ids,
 * a briefing that changes), which would cost a rejected request per step.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicChatProvider, assistantBriefing, assistantSystemPrompt } from "@workspace/ai-player";
import { buildHistory, commandIdFor, modelTools, prepareArgs, type HistoryCall, type HistoryRow } from "../../convex/assistant/rules.ts";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());
type Block = Record<string, any>;
type Step = { tools?: { name: string; input: Record<string, unknown> }[]; text?: string };

/** A stand-in Messages API: thinking bound to its prefix, tool results required for every tool use. */
function fakeApi(script: Step[]) {
  const seen = { requests: 0, rejected: 0, replayedThinking: 0 };
  let n = 0;
  const fetch = async (_url: unknown, init?: RequestInit) => {
    seen.requests++;
    const body = JSON.parse(String(init!.body));
    assert.deepEqual(body.thinking, { type: "adaptive" });
    const prefix = (messages: unknown[], blocks: unknown[]) => sha({ system: body.system, tools: body.tools, messages, blocks });
    for (const [i, m] of body.messages.entries()) {
      if (m.role !== "assistant") continue;
      for (const [j, b] of (m.content as Block[]).entries()) {
        if (b.type !== "thinking") continue;
        seen.replayedThinking++;
        if (b.signature !== prefix(body.messages.slice(0, i), m.content.slice(0, j))) {
          seen.rejected++;
          return Response.json({ type: "error", error: { type: "invalid_request_error", message: `messages.${i}.content.${j}: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation.` } }, { status: 400 });
        }
      }
      const uses = (m.content as Block[]).filter(b => b.type === "tool_use").map(b => b.id);
      const results = (body.messages[i + 1]?.content ?? []).filter?.((b: Block) => b.type === "tool_result").map((b: Block) => b.tool_use_id) ?? [];
      assert.deepEqual(results, uses, `messages.${i}: every tool use is answered next`);
    }
    const step = script[n++] ?? { text: "Done." };
    const blocks: Block[] = [];
    const think = { type: "thinking", thinking: "", signature: prefix(body.messages, []) };
    blocks.push(think);
    if (step.text) blocks.push({ type: "text", text: step.text });
    (step.tools ?? []).forEach((t, k) => blocks.push({ type: "tool_use", id: `toolu_${n}_${k}`, name: t.name, input: t.input }));
    const events: Block[] = [{ type: "message_start", message: { id: `msg_${n}`, type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } }];
    blocks.forEach((b, index) => {
      if (b.type === "thinking") events.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }, { type: "content_block_delta", index, delta: { type: "signature_delta", signature: b.signature } });
      else if (b.type === "text") events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } });
      else events.push({ type: "content_block_start", index, content_block: { ...b, input: {} } }, { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
      events.push({ type: "content_block_stop", index });
    });
    events.push({ type: "message_delta", delta: { stop_reason: step.tools?.length ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 50 } }, { type: "message_stop" });
    return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  };
  return { seen, provider: anthropicChatProvider(new Anthropic({ apiKey: "test-not-a-real-key", fetch, maxRetries: 0 }) as unknown as Parameters<typeof anthropicChatProvider>[0], { model: "claude-sonnet-5-5", inputUsdPerMillion: 2, outputUsdPerMillion: 10 }) };
}

/** The engine's turn loop in memory: steps until the model ends the turn, storing what step.ts stores (briefings too). */
const briefings: Record<string, string> = {};
async function runTurn(api: ReturnType<typeof fakeApi>, rows: HistoryRow[], calls: HistoryCall[], turnId: string, text: string) {
  const system = assistantSystemPrompt({ playerName: "Ann", roomCode: "ABCD", permission: "act" });
  const tools = modelTools("act");
  const briefing = assistantBriefing({ observation: { phase: "planning", language: "python", self: { energy: 100, utility: { name: "Power Hoarder", summary: "Factors of 3." } } } });
  briefings[turnId] = briefing;
  rows.push({ id: `${turnId}-u`, turnId, role: "user", text });
  for (let s = 0; s < 6; s++) {
    const result = await api.provider.stream({ system, tools, messages: buildHistory(rows, calls, { turnId, briefings }), maxOutputTokens: 8192, signal: new AbortController().signal });
    const id = `${turnId}-m${s}`;
    rows.push({ id, turnId, role: "assistant", text: result.content.flatMap(b => b.type === "text" ? [b.text] : []).join(""), contentJson: JSON.stringify(result.content) });
    result.content.forEach(b => {
      if (b.type !== "tool_use") return;
      const args = prepareArgs(b.name, b.input, commandIdFor(turnId, b.id, sha1));
      calls.push({ messageId: id, callId: b.id, index: calls.length, tool: b.name, argsJson: JSON.stringify(args), status: "ok", resultJson: JSON.stringify({ untrusted: true, data: { tool: b.name } }) });
    });
    if (result.stopReason === "end_turn") return result;
  }
  throw new Error("the turn did not end");
}

test("a multi-step turn with thinking (the screenshot's 'Suggest an opening agent') replays valid thinking at every step", async () => {
  const api = fakeApi([
    { tools: [{ name: "get_observation", input: { objectsLimit: 5 } }, { name: "get_rules", input: {} }, { name: "get_my_utility", input: {} }] },
    { text: "Let me check it.", tools: [{ name: "validate_agent", input: { source: "def agent(x):\n    return [add(3)]" } }] },
    { text: "Here is an opening agent: def agent(x): return [add(3)]." },
    { tools: [{ name: "evaluate_value", input: { value: 81 } }] },
    { text: "81 is worth 4 factors of 3." },
  ]);
  const rows: HistoryRow[] = [];
  const calls: HistoryCall[] = [];
  const first = await runTurn(api, rows, calls, "T1", "Suggest an opening agent for me");
  assert.deepEqual(first.content.filter(b => b.type === "text"), [{ type: "text", text: "Here is an opening agent: def agent(x): return [add(3)]." }]);
  const second = await runTurn(api, rows, calls, "T2", "What is 81 worth?");
  assert.deepEqual(second.content.filter(b => b.type === "text"), [{ type: "text", text: "81 is worth 4 factors of 3." }]);
  assert.equal(api.seen.rejected, 0, "no thinking block was ever invalidated");
  assert.equal(api.seen.requests, 5, "one request per step, no retries");
  assert.ok(api.seen.replayedThinking >= 3 + 3 * 2, "each step replays the thread's thinking, the first turn's included in the second");
  assert.ok(JSON.parse(calls.find(c => c.tool === "validate_agent")!.argsJson).commandId, "the call ran with the engine's derived id");
});
