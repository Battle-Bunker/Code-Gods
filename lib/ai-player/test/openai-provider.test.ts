import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { openAIProvider, createDirectOpenAIProvider, openAISupportsStructuredOutputs, AITurnError } from "../src/provider.ts";
import { decisionJsonSchema } from "../src/policy.ts";

const prices = { inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 };
const request = { system: "Immutable policy", data: '{"chat":"untrusted"}', maxOutputTokens: 100, signal: new AbortController().signal };
test("OpenAI adapter uses configured model and JSON protocol, counts usage, and disables retries", async () => {
  let calls = 0;
  const client = new OpenAI({ apiKey: "test-not-a-real-key", maxRetries: 0,
    fetch: async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(String(init!.body));
      assert.equal(body.model, "gpt-4.1-mini");
      assert.deepEqual(body.messages, [{ role: "system", content: request.system }, { role: "user", content: request.data }]);
      assert.equal(body.max_completion_tokens, 100);
      assert.deepEqual(body.response_format, { type: "json_object" });
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"actions":[]}' } }], usage: { prompt_tokens: 20, completion_tokens: 7 } });
    },
  });
  const provider = openAIProvider(client, "gpt-4.1-mini", prices);
  assert.equal(provider.estimateMaxUsd(1_000_000, 1_000_000), 2);
  assert.deepEqual(await provider.complete(request), { text: '{"actions":[]}', inputTokens: 20, outputTokens: 7 });
  assert.equal(calls, 1);
});
test("OpenAI failures make one attempt and never fall back", async () => {
  let calls = 0;
  const client = new OpenAI({ apiKey: "test-not-a-real-key", fetch: async () => {
    calls++;
    return Response.json({ error: { message: "unavailable", type: "server_error" } }, { status: 500 });
  } });
  await assert.rejects(openAIProvider(client, "gpt-4.1-mini", prices).complete(request));
  assert.equal(calls, 1);
  assert.throws(() => createDirectOpenAIProvider("", "gpt-4.1-mini", prices), /OPENAI_API_KEY/);
});
const reply = (message: Record<string, unknown>, finish_reason = "stop") =>
  Response.json({ choices: [{ finish_reason, message: { role: "assistant", content: null, refusal: null, ...message } }], usage: { prompt_tokens: 20, completion_tokens: 7 } });
const withFetch = (fetch: (url: unknown, init?: RequestInit) => Promise<Response>, model = "gpt-4.1-mini") =>
  openAIProvider(new OpenAI({ apiKey: "test-not-a-real-key", maxRetries: 0, fetch: fetch as any }), model, prices);
test("the decision schema (the same builder as the Anthropic path) is sent as a strict json_schema response format", async () => {
  const schema = decisionJsonSchema(["python", "typescript"]);
  let body: any;
  await withFetch(async (_url, init) => { body = JSON.parse(String(init!.body)); return reply({ content: '{"actions":[]}' }); }).complete({ ...request, responseSchema: schema });
  assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "decision", strict: true, schema } });
  assert.equal(body.tools, undefined);
});
test("strict mode holds for the decision schema: every object closes its properties and requires them all", () => {
  const objects: any[] = [];
  const walk = (node: any) => { if (node && typeof node === "object") { if (node.type === "object") objects.push(node); Object.values(node).forEach(walk); } };
  walk(decisionJsonSchema(["python"]));
  assert.ok(objects.length >= 7);
  for (const o of objects) { assert.equal(o.additionalProperties, false); assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort()); }
});
test("a model without structured outputs falls back to JSON mode", async () => {
  assert.equal(openAISupportsStructuredOutputs("gpt-4.1-mini"), true);
  assert.equal(openAISupportsStructuredOutputs("gpt-4o-2024-05-13"), false);
  assert.equal(openAISupportsStructuredOutputs("gpt-3.5-turbo"), false);
  let body: any;
  await withFetch(async (_url, init) => { body = JSON.parse(String(init!.body)); return reply({ content: '{"actions":[]}' }); }, "gpt-3.5-turbo")
    .complete({ ...request, responseSchema: decisionJsonSchema(["python"]) });
  assert.deepEqual(body.response_format, { type: "json_object" });
});
test("a refusal, a cut-off reply and a filtered reply are typed incomplete_reply failures", async () => {
  for (const [message, finish] of [[{ refusal: "I can't help with that." }, "stop"], [{ content: '{"actions":[' }, "length"], [{ content: "" }, "content_filter"]] as const) {
    const error: any = await withFetch(async () => reply(message, finish)).complete(request).then(() => null, e => e);
    assert.ok(error instanceof AITurnError, `${finish}: typed`);
    assert.equal(error.reason, "incomplete_reply");
    assert.equal(error.message.includes("can't help"), false, "the refusal text stays out of the message");
  }
});
