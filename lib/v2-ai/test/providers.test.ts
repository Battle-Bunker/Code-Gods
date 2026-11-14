/** The fetch adapters against a stubbed fetch (no network): request shape, answer mapping, refusals. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { anthropicProvider, Budget, ChatError, findModel, MODELS, openAIProvider, type ChatMessage } from "../src/index.ts";

function stubFetch(answer: unknown, status = 200) {
  const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(answer), { status });
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = original; } };
}

const tools = [{ name: "agent_check", description: "Check.", input_schema: { type: "object" } }];
const history: ChatMessage[] = [
  { role: "user", content: "check it" },
  { role: "assistant", content: [{ type: "thinking", provider: "anthropic", block: { type: "thinking", thinking: "", signature: "sig" } }, { type: "tool_use", id: "t1", name: "agent_check", input: { source: "x" } }] },
  { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "{}" }] },
];
const opus = findModel("claude-opus-5-5")!;

test("Anthropic: sends the key, tools and history (thinking replayed), maps the answer and usage", async () => {
  const f = stubFetch({
    stop_reason: "tool_use",
    content: [{ type: "thinking", thinking: "", signature: "s2" }, { type: "text", text: "Again." }, { type: "tool_use", id: "t2", name: "agent_check", input: { source: "y" } }],
    usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 },
  });
  try {
    const p = anthropicProvider({ apiKey: "k", model: opus.id, prices: opus.prices });
    const step = await p.step({ system: "sys", messages: history, tools, maxOutputTokens: 1000 });
    const { headers, body } = f.sent[0]!;
    assert.equal(headers["x-api-key"], "k");
    assert.equal(body.model, "claude-opus-5-5");
    assert.deepEqual(body.tools, tools);
    const msgs = body.messages as { role: string; content: { type: string }[] }[];
    assert.deepEqual(msgs[1]!.content.map(b => b.type), ["thinking", "tool_use"]);
    assert.deepEqual(msgs[2]!.content[0], { type: "tool_result", tool_use_id: "t1", content: "{}" });
    assert.equal(step.stop, "tool_use");
    assert.deepEqual(step.content.map(b => b.type), ["thinking", "text", "tool_use"]);
    assert.deepEqual(step.usage, { inputTokens: 115, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 5 });
  } finally { f.restore(); }
});

test("Anthropic: a refusal or a cut is a billed ChatError; an HTTP error is unbilled", async () => {
  const p = anthropicProvider({ apiKey: "k", model: opus.id, prices: opus.prices });
  let f = stubFetch({ stop_reason: "refusal", content: [], usage: { input_tokens: 10, output_tokens: 0 } });
  try {
    await assert.rejects(p.step({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100 }),
      (e: ChatError) => e instanceof ChatError && e.usage?.inputTokens === 10);
  } finally { f.restore(); }
  f = stubFetch({ error: { message: "overloaded" } }, 529);
  try {
    await assert.rejects(p.step({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [], maxOutputTokens: 100 }),
      (e: ChatError) => e.status === 529 && e.usage === undefined);
  } finally { f.restore(); }
});

test("OpenAI: tool results become tool messages; tool calls map back", async () => {
  const f = stubFetch({
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", function: { name: "agent_check", arguments: "{\"source\":\"z\"}" } }] } }],
    usage: { prompt_tokens: 50, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 20 } },
  });
  try {
    const m = findModel("gpt-4.1-mini")!;
    const step = await openAIProvider({ apiKey: "k", model: m.id, prices: m.prices }).step({ system: "sys", messages: history, tools, maxOutputTokens: 1000 });
    const { headers, body } = f.sent[0]!;
    assert.equal(headers.authorization, "Bearer k");
    assert.deepEqual((body.messages as { role: string }[]).map(x => x.role), ["system", "user", "assistant", "tool"]);
    assert.deepEqual(step.content, [{ type: "tool_use", id: "c1", name: "agent_check", input: { source: "z" } }]);
    assert.equal(step.stop, "tool_use");
    assert.equal(step.usage.cacheReadTokens, 20);
  } finally { f.restore(); }
});

test("the catalogue prices every model, and the budget counts dollars", () => {
  for (const m of MODELS) assert.ok(m.prices.input > 0 && m.prices.output > 0, m.id);
  const b = new Budget({ tokens: 10_000, usd: 0.045 });
  assert.equal(b.allows(opus.prices, 1000, 1000), true); // 1000 × $5 + 1000 × $20 per million = $0.025
  b.record(opus.prices, { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 }); // $0.024
  assert.equal(b.allows(opus.prices, 1000, 1000), false);
  assert.throws(() => anthropicProvider({ apiKey: " ", model: opus.id, prices: opus.prices }));
});
