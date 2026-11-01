import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicProvider, ANTHROPIC_PLAYER_CONFIG, createDirectAnthropicProvider } from "../src/anthropic-provider.ts";

const request = { system: "Return JSON", data: '{"chat":"untrusted"}', maxOutputTokens: 100, signal: new AbortController().signal };
const response = {
  id: "msg_test", type: "message", role: "assistant", model: ANTHROPIC_PLAYER_CONFIG.model,
  content: [{ type: "text", text: '{"actions":[]}' }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 20, output_tokens: 7 },
};
function mocked(fetch: typeof globalThis.fetch) {
  return anthropicProvider(new Anthropic({ apiKey: "test-not-a-real-key", fetch, maxRetries: 0 }));
}
test("Anthropic request keeps policy separate from untrusted game data and accounts for usage", async () => {
  const model = mocked(async (url, init) => {
    assert.equal(String(url), "https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init!.body));
    assert.equal(body.model, ANTHROPIC_PLAYER_CONFIG.model);
    assert.equal(body.system, request.system);
    assert.deepEqual(body.messages, [{ role: "user", content: request.data }]);
    assert.equal(body.max_tokens, 100);
    assert.equal(body.tools, undefined);
    assert.equal(body.thinking, undefined);
    return Response.json(response);
  });
  assert.deepEqual(await model.complete(request), { text: '{"actions":[]}', inputTokens: 20, outputTokens: 7 });
  assert.equal(model.estimateMaxUsd(1000000, 1000000), 12);
});
test("truncated or refused responses are never treated as complete decisions", async () => {
  for (const stop_reason of ["max_tokens", "refusal"]) {
    await assert.rejects(mocked(async () => Response.json({ ...response, stop_reason })).complete(request), /Incomplete/);
  }
});
test("failed API requests are not retried and have no provider fallback", async () => {
  let calls = 0;
  const model = mocked(async () => { calls++; return Response.json({ error: { type: "overloaded_error", message: "Unavailable" } }, { status: 529 }); });
  await assert.rejects(model.complete(request));
  assert.equal(calls, 1);
});
test("empty credentials fail closed without making requests", () => {
  assert.throws(() => createDirectAnthropicProvider(""), /ANTHROPIC_API_KEY/);
});
test("thinking blocks (on by default on Claude 5 models) are skipped; the decision is the text", async () => {
  const thinking = [{ type: "thinking", thinking: "", signature: "sig" }, { type: "redacted_thinking", data: "opaque" }];
  const model = mocked(async () => Response.json({ ...response, content: [...thinking, ...response.content] }));
  assert.deepEqual(await model.complete(request), { text: '{"actions":[]}', inputTokens: 20, outputTokens: 7 });
  await assert.rejects(mocked(async () => Response.json({ ...response, content: thinking })).complete(request), /Incomplete|unsupported/i, "thinking alone is no answer");
});
test("a response schema is sent as structured output (output_config.format), so the reply is always the decision JSON", async () => {
  const schema = { type: "object", properties: { actions: { type: "array", items: {} } }, required: ["actions"], additionalProperties: false };
  let body: any;
  const model = mocked(async (_url, init) => { body = JSON.parse(String(init!.body)); return Response.json(response); });
  await model.complete({ ...request, responseSchema: schema });
  assert.deepEqual(body.output_config, { format: { type: "json_schema", schema } });
  assert.equal(body.tools, undefined);
});
test("an incomplete reply is a typed incomplete_reply failure", async () => {
  const error: any = await mocked(async () => Response.json({ ...response, stop_reason: "max_tokens" })).complete(request).then(() => null, e => e);
  assert.equal(error.reason, "incomplete_reply");
});
