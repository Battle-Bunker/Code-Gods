import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { openAIProvider, createDirectOpenAIProvider } from "../src/provider.ts";

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
