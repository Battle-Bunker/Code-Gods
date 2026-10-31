/**
 * The streaming, tool-using Anthropic ChatProvider (src/chat-anthropic.ts) against the real SDK with an injected
 * fetch that answers with Messages API server-sent events: text deltas reach onText, tool_use blocks are parsed,
 * max_tokens and other stops are errors, usage is validated, aborts reject, and nothing is retried.
 */
import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicChatProvider, createDirectAnthropicChatProvider, type ChatRequest } from "../src/index.ts";

const config = { model: "claude-sonnet-5-5", inputUsdPerMillion: 2, outputUsdPerMillion: 10 };
const sse = (events: Record<string, unknown>[]) =>
  events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const start = (input = 20) => ({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: config.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: input, output_tokens: 1 } } });
const text = (index: number, ...parts: string[]) => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  ...parts.map(t => ({ type: "content_block_delta", index, delta: { type: "text_delta", text: t } })),
  { type: "content_block_stop", index },
];
const toolUse = (index: number, id: string, name: string, json: string[]) => [
  { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } },
  ...json.map(partial_json => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json } })),
  { type: "content_block_stop", index },
];
const end = (stop_reason: string, output = 15) => [
  { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: output } },
  { type: "message_stop" },
];
const stream = (events: Record<string, unknown>[]) => new Response(sse(events), { headers: { "content-type": "text/event-stream" } });

function provider(fetch: typeof globalThis.fetch) {
  return anthropicChatProvider(new Anthropic({ apiKey: "test-not-a-real-key", fetch, maxRetries: 0 }), config);
}
const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  system: "You are the assistant.", maxOutputTokens: 100, signal: new AbortController().signal,
  tools: [{ name: "get_observation", description: "Your view", inputSchema: { type: "object", properties: { objectsLimit: { type: "integer" } }, additionalProperties: false } }],
  messages: [
    { role: "user", content: "What is happening?" },
    { role: "assistant", content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "toolu_0", name: "get_observation", input: {} }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_0", content: '{"untrusted":true,"data":{}}' }] },
    { role: "user", content: "And now?" },
  ],
  ...over,
});

test("streams text to onText, parses tool_use blocks and reports usage; the request carries tools and history", async () => {
  let body: any;
  const model = provider(async (url, init) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    body = JSON.parse(String(init!.body));
    return stream([start(), ...text(0, "Let me ", "look."), ...toolUse(1, "toolu_1", "get_observation", ['{"objects', 'Limit": 5}']), ...end("tool_use")]);
  });
  const deltas: string[] = [];
  const result = await model.stream(request({ onText: d => deltas.push(d) }));
  assert.deepEqual(deltas, ["Let me ", "look."]);
  assert.deepEqual(result, {
    content: [{ type: "text", text: "Let me look." }, { type: "tool_use", id: "toolu_1", name: "get_observation", input: { objectsLimit: 5 } }],
    stopReason: "tool_use", inputTokens: 20, outputTokens: 15,
  });
  assert.equal(body.model, config.model);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 100);
  assert.equal(body.system, "You are the assistant.");
  assert.deepEqual(body.tools, [{ name: "get_observation", description: "Your view", input_schema: { type: "object", properties: { objectsLimit: { type: "integer" } }, additionalProperties: false } }]);
  // Consecutive user turns (a tool result, then the next question) are merged into one user message.
  assert.deepEqual(body.messages, [
    { role: "user", content: "What is happening?" },
    { role: "assistant", content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "toolu_0", name: "get_observation", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_0", content: '{"untrusted":true,"data":{}}' }, { type: "text", text: "And now?" }] },
  ]);
  assert.equal(body.thinking, undefined);
  assert.equal(model.estimateMaxUsd(1_000_000, 1_000_000), 12);
});

test("a plain answer ends the turn", async () => {
  const result = await provider(async () => stream([start(), ...text(0, "Done."), ...end("end_turn", 3)])).stream(request());
  assert.deepEqual(result, { content: [{ type: "text", text: "Done." }], stopReason: "end_turn", inputTokens: 20, outputTokens: 3 });
});

test("max_tokens, refusals and other stops are errors, never a complete answer", async () => {
  for (const stop of ["max_tokens", "refusal", "pause_turn", "stop_sequence"]) {
    await assert.rejects(provider(async () => stream([start(), ...text(0, "Half"), ...end(stop)])).stream(request()), /stop|incomplete/i, stop);
  }
});

test("usage beyond the output ceiling or a malformed count is rejected", async () => {
  await assert.rejects(provider(async () => stream([start(), ...text(0, "x"), ...end("end_turn", 101)])).stream(request()), /usage/i);
  await assert.rejects(provider(async () => stream([start(-1), ...text(0, "x"), ...end("end_turn", 1)])).stream(request()), /usage/i);
});

test("an abort rejects the stream", async () => {
  const controller = new AbortController();
  const model = provider(async (_url, init) => {
    const signal = (init as RequestInit).signal!;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse([start(), { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } }])));
        signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  const pending = model.stream(request({ signal: controller.signal, onText: () => controller.abort() }));
  await assert.rejects(pending);
});

test("failed requests make one attempt (no retries) and empty keys fail closed", async () => {
  let calls = 0;
  const model = provider(async () => { calls++; return Response.json({ type: "error", error: { type: "overloaded_error", message: "Unavailable" } }, { status: 529 }); });
  await assert.rejects(model.stream(request()));
  assert.equal(calls, 1);
  assert.throws(() => createDirectAnthropicChatProvider("", config), /ANTHROPIC_API_KEY/);
});
