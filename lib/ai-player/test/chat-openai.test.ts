/**
 * The streaming, tool-using OpenAI ChatProvider (src/chat-openai.ts) against the real SDK with an injected fetch
 * answering with chat-completions chunks: text deltas, tool calls assembled from fragments, finish reasons,
 * usage (stream_options.include_usage), and no retries.
 */
import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { openAIChatProvider, createDirectOpenAIChatProvider, type ChatRequest } from "../src/index.ts";

const prices = { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 };
const chunk = (delta: Record<string, unknown>, finish_reason: string | null = null) =>
  ({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-4.1-mini", choices: [{ index: 0, delta, finish_reason }] });
const usage = (prompt_tokens: number, completion_tokens: number) =>
  ({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-4.1-mini", choices: [], usage: { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens } });
const stream = (chunks: unknown[]) =>
  new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
const provider = (fetch: typeof globalThis.fetch) => openAIChatProvider(new OpenAI({ apiKey: "test-not-a-real-key", fetch, maxRetries: 0 }), "gpt-4.1-mini", prices);
const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  system: "You are the assistant.", maxOutputTokens: 100, signal: new AbortController().signal,
  tools: [{ name: "get_observation", description: "Your view", inputSchema: { type: "object", properties: {} } }],
  messages: [
    { role: "user", content: "Hi" },
    { role: "assistant", content: [{ type: "tool_use", id: "call_0", name: "get_observation", input: {} }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "call_0", content: "{}", isError: true }] },
  ],
  ...over,
});

test("streams text, assembles tool calls from fragments, reports usage; the request carries tools and history", async () => {
  let body: any;
  const model = provider(async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    body = JSON.parse(String(init!.body));
    return stream([
      chunk({ role: "assistant", content: "One " }), chunk({ content: "moment." }),
      chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_observation", arguments: '{"objects' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'Limit":5}' } }] }),
      chunk({}, "tool_calls"), usage(30, 9),
    ]);
  });
  const deltas: string[] = [];
  const result = await model.stream(request({ onText: d => deltas.push(d) }));
  assert.deepEqual(deltas, ["One ", "moment."]);
  assert.deepEqual(result, {
    content: [{ type: "text", text: "One moment." }, { type: "tool_use", id: "call_1", name: "get_observation", input: { objectsLimit: 5 } }],
    stopReason: "tool_use", inputTokens: 30, outputTokens: 9,
  });
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.max_completion_tokens, 100);
  assert.deepEqual(body.tools, [{ type: "function", function: { name: "get_observation", description: "Your view", parameters: { type: "object", properties: {} } } }]);
  assert.deepEqual(body.messages, [
    { role: "system", content: "You are the assistant." },
    { role: "user", content: "Hi" },
    { role: "assistant", content: null, tool_calls: [{ id: "call_0", type: "function", function: { name: "get_observation", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "call_0", content: "{}" },
  ]);
  assert.equal(model.estimateMaxUsd(1_000_000, 1_000_000), 2);
});

test("length and content-filter stops are errors; missing usage is an error", async () => {
  for (const finish of ["length", "content_filter"]) {
    await assert.rejects(provider(async () => stream([chunk({ content: "x" }), chunk({}, finish), usage(1, 1)])).stream(request()), /stop|incomplete/i);
  }
  await assert.rejects(provider(async () => stream([chunk({ content: "x" }), chunk({}, "stop")])).stream(request()), /usage/i);
  await assert.rejects(provider(async () => stream([chunk({ content: "x" }), chunk({}, "stop"), usage(1, 500)])).stream(request()), /usage/i);
});

test("unparseable tool arguments are an error", async () => {
  await assert.rejects(provider(async () => stream([
    chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_observation", arguments: "{oops" } }] }),
    chunk({}, "tool_calls"), usage(1, 1),
  ])).stream(request()), /arguments/i);
});

test("failures make one attempt and keys fail closed", async () => {
  let calls = 0;
  const model = provider(async () => { calls++; return Response.json({ error: { message: "unavailable", type: "server_error" } }, { status: 500 }); });
  await assert.rejects(model.stream(request()));
  assert.equal(calls, 1);
  assert.throws(() => createDirectOpenAIChatProvider("", "gpt-4.1-mini", prices), /OPENAI_API_KEY/);
});

test("an aborted signal rejects before or during the request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(provider(async () => stream([chunk({ content: "x" }), chunk({}, "stop"), usage(1, 1)])).stream(request({ signal: controller.signal })));
});
