/**
 * The streaming, tool-using Anthropic ChatProvider (src/chat-anthropic.ts) against the real SDK with an injected
 * fetch that answers with Messages API server-sent events: text deltas reach onText, tool_use blocks are parsed,
 * max_tokens and other stops are errors, usage is validated, aborts reject, and nothing is retried.
 */
import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { ChatAbortedError, worstCaseCost, anthropicChatProvider, createDirectAnthropicChatProvider, inputChars, providerFailure, type ChatRequest } from "../src/index.ts";

const config = { model: "claude-sonnet-5-5", inputUsdPerMillion: 2, outputUsdPerMillion: 10 };
const sse = (events: Record<string, unknown>[]) =>
  events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const start = (input = 20, cache: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number } = {}) =>
  ({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: config.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: input, output_tokens: 1, ...cache } } });
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
    stopReason: "tool_use", inputTokens: 20, outputTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0,
  });
  assert.equal(body.model, config.model);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 100);
  // Prompt caching: a breakpoint on the system prompt (tools and system, shared by every step of a thread) and
  // top-level automatic caching for the growing conversation.
  assert.deepEqual(body.system, [{ type: "text", text: "You are the assistant.", cache_control: { type: "ephemeral" } }]);
  assert.deepEqual(body.cache_control, { type: "ephemeral" });
  assert.deepEqual(body.tools, [{ name: "get_observation", description: "Your view", input_schema: { type: "object", properties: { objectsLimit: { type: "integer" } }, additionalProperties: false } }]);
  // Consecutive user turns (a tool result, then the next question) are merged into one user message.
  assert.deepEqual(body.messages, [
    { role: "user", content: "What is happening?" },
    { role: "assistant", content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "toolu_0", name: "get_observation", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_0", content: '{"untrusted":true,"data":{}}' }, { type: "text", text: "And now?" }] },
  ]);
  assert.deepEqual(body.thinking, { type: "adaptive" }, "thinking is explicit: models that think by default keep doing so");
  assert.deepEqual(body.output_config, { effort: "medium" });
  assert.equal(worstCaseCost(model.prices, 1_000_000, 1_000_000).usd, 12);
});

const thinking = (index: number, signature: string) => [
  { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } },
  { type: "content_block_delta", index, delta: { type: "signature_delta", signature } },
  { type: "content_block_stop", index },
];
const redacted = (index: number, data: string) => [
  { type: "content_block_start", index, content_block: { type: "redacted_thinking", data } },
  { type: "content_block_stop", index },
];

// The bug behind "Unsupported Anthropic content block: thinking": Claude 5 models think by default and return
// thinking blocks with every answer. They must come back opaque, in order, and be replayed byte-for-byte.
test("thinking and redacted_thinking blocks come back opaque and in order, and are replayed verbatim", async () => {
  const bodies: any[] = [];
  const model = provider(async (_url, init) => {
    bodies.push(JSON.parse(String(init!.body)));
    return bodies.length === 1
      ? stream([start(), ...thinking(0, "sig-1"), ...redacted(1, "opaque-2"), ...text(2, "Reading."), ...toolUse(3, "toolu_1", "get_observation", ["{}"]), ...end("tool_use")])
      : stream([start(), ...thinking(0, "sig-3"), ...text(1, "Done."), ...end("end_turn")]);
  });
  const first = await model.stream(request({ messages: [{ role: "user", content: "Suggest an opening agent for me" }] }));
  assert.deepEqual(first.content, [
    { type: "thinking", provider: "anthropic", block: { type: "thinking", thinking: "", signature: "sig-1" } },
    { type: "thinking", provider: "anthropic", block: { type: "redacted_thinking", data: "opaque-2" } },
    { type: "text", text: "Reading." },
    { type: "tool_use", id: "toolu_1", name: "get_observation", input: {} },
  ]);
  const second = await model.stream(request({ messages: [
    { role: "user", content: "Suggest an opening agent for me" },
    { role: "assistant", content: first.content },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: "{}" }] },
  ] }));
  assert.deepEqual(second.content.map(b => b.type), ["thinking", "text"]);
  assert.deepEqual(bodies[1].messages[1].content, [
    { type: "thinking", thinking: "", signature: "sig-1" },
    { type: "redacted_thinking", data: "opaque-2" },
    { type: "text", text: "Reading." },
    { type: "tool_use", id: "toolu_1", name: "get_observation", input: {} },
  ]);
});

test("a history the API rejects for its thinking signatures is retried once without thinking; other 400s are not", async () => {
  const bodies: any[] = [];
  const rejectThinking = provider(async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    bodies.push(body);
    if (JSON.stringify(body.messages).includes('"thinking"')) {
      return Response.json({ type: "error", error: { type: "invalid_request_error", message: "messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation." } }, { status: 400 });
    }
    return stream([start(), ...text(0, "Recovered."), ...end("end_turn")]);
  });
  const history = request({ messages: [
    { role: "user", content: "Hi" },
    { role: "assistant", content: [{ type: "thinking", provider: "anthropic", block: { type: "thinking", thinking: "", signature: "stale" } }, { type: "tool_use", id: "toolu_1", name: "get_observation", input: {} }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: "{}" }] },
  ] });
  const result = await rejectThinking.stream(history);
  assert.deepEqual(result.content, [{ type: "text", text: "Recovered." }]);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1].messages[1].content, [{ type: "tool_use", id: "toolu_1", name: "get_observation", input: {} }]);

  let calls = 0;
  const otherError = provider(async () => { calls++; return Response.json({ type: "error", error: { type: "invalid_request_error", message: "max_tokens: too large" } }, { status: 400 }); });
  await assert.rejects(otherError.stream(history));
  assert.equal(calls, 1);
});

test("a plain answer ends the turn", async () => {
  const result = await provider(async () => stream([start(), ...text(0, "Done."), ...end("end_turn", 3)])).stream(request());
  assert.deepEqual(result, { content: [{ type: "text", text: "Done." }], stopReason: "end_turn", inputTokens: 20, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 });
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

test("cache reads and writes are reported as parts of the input; a cache split larger than the input is rejected", async () => {
  const cached = await provider(async () => stream([start(20, { cache_read_input_tokens: 900, cache_creation_input_tokens: 50 }), ...text(0, "Done."), ...end("end_turn", 3)])).stream(request());
  assert.deepEqual([cached.inputTokens, cached.cacheReadTokens, cached.cacheWriteTokens, cached.outputTokens], [970, 900, 50, 3]);
});

test("estimateInputTokens asks count_tokens with the request's system, tools and history; falls back to characters per token", async () => {
  let body: any, url = "";
  const counted = await provider(async (u, init) => { url = String(u); body = JSON.parse(String(init!.body)); return Response.json({ input_tokens: 1234 }); })
    .estimateInputTokens(request());
  assert.deepEqual(counted, { tokens: 1234, counted: true });
  assert.equal(url, "https://api.anthropic.com/v1/messages/count_tokens");
  assert.equal(body.model, config.model);
  assert.equal(body.system[0].text, "You are the assistant.");
  assert.equal(body.tools[0].name, "get_observation");
  assert.equal(body.messages.length, 3, "merged history");
  assert.deepEqual(body.thinking, { type: "adaptive" }, "counted with the request's thinking settings");
  const fallback = await provider(async () => Response.json({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }, { status: 429 }))
    .estimateInputTokens(request());
  assert.deepEqual(fallback, { tokens: Math.ceil(inputChars(request()) / 2.5), counted: false });
});

test("an abort rejects the stream with what is known: the reported input, the streamed characters and reasoning time", async () => {
  const controller = new AbortController();
  const model = provider(async (_url, init) => {
    const signal = (init as RequestInit).signal!;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse([start(100, { cache_read_input_tokens: 5000, cache_creation_input_tokens: 300 }), ...thinking(0, "sig"),
          { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Partial" } }])));
        signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
  const error = await model.stream(request({ signal: controller.signal, onText: () => controller.abort() })).then(() => null, e => e);
  assert.ok(error instanceof ChatAbortedError, String(error));
  assert.deepEqual(error.partial.input, { inputTokens: 5400, cacheReadTokens: 5000, cacheWriteTokens: 300 });
  assert.equal(error.partial.outputChars, "Partial".length);
  assert.ok(error.partial.reasoningMs >= 0 && error.partial.reasoningMs < 5000);
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

test("Anthropic's out-of-credit and overloaded answers become a player-facing reason", async () => {
  const failure = async (status: number, error: Record<string, unknown>) => {
    try { await provider(async () => Response.json({ type: "error", error }, { status })).stream(request()); } catch (e) { return providerFailure(e); }
    throw new Error("expected a failure");
  };
  const credits = await failure(400, { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." });
  assert.deepEqual([credits.unbilled, /out of credit/i.test(credits.message)], [true, true]);
  const overloaded = await failure(529, { type: "overloaded_error", message: "Overloaded" });
  assert.deepEqual([overloaded.unbilled, /try again in a few minutes/i.test(overloaded.message)], [true, true]);
  // Any other request error keeps the provider's text (the engine's own bug, worth seeing).
  const other = await failure(400, { type: "invalid_request_error", message: "max_tokens: too large" });
  assert.match(other.message, /^The model call failed: .*max_tokens: too large/);
});
