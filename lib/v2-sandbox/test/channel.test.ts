/** The host side of the channel: shape checks, the cap, and receipts charged only for replies the agent receives. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Channel, createSandbox, LIMITS, type AgentHost, type HostReply } from "../src/index.ts";

const answering = (reply: unknown): AgentHost => ({ handle: () => reply as HostReply });

test("a reply too large to deliver becomes a host error and charges nothing", () => {
  const channel = new Channel(answering({ ok: true, result: { energy: 1, pad: "x".repeat(LIMITS.messageBytes) }, bits: 200 }), 8);
  assert.deepEqual(JSON.parse(channel.call('{"op":"budget"}')), { ok: false, error: `the reply is over ${LIMITS.messageBytes} bytes` });
  assert.equal(channel.readBits, 0);
});

test("a reply that is not JSON data, or has no receipt, is the host's failure", () => {
  for (const reply of [{ ok: true, result: { energy: 5n }, bits: 0 }, { ok: true, result: {} }, { nonsense: 1 }]) {
    const channel = new Channel(answering(reply), 8);
    assert.match(JSON.parse(channel.call('{"op":"budget"}')).error, /^the host failed: /);
    assert.equal(channel.readBits, 0);
  }
});

test("malformed requests never reach the host or use the cap", () => {
  let calls = 0;
  const channel = new Channel({ handle: () => (calls++, { ok: true, result: {}, bits: 1 } as HostReply) }, 1);
  for (const text of ["[]", "null", '{"op":"steal"}', "{"]) assert.equal(JSON.parse(channel.call(text)).ok, false);
  assert.equal(JSON.parse(channel.call('{"op":"budget"}')).ok, true);
  assert.equal(calls, 1);
  assert.equal(channel.readBits, 1);
});

test("closing a worker sandbox with an act in flight rejects that act", async () => {
  const sandbox = await createSandbox({ language: "javascript", execution: "worker" });
  const act = sandbox.act({ source: "function agent(o) { for (;;) { 'x'.repeat(20000).split('').reverse(); } }", offer: { object: 0 }, seed: "1", host: answering({ ok: false, error: "no" }), limits: { stepBudget: 10_000_000, wallMs: 10_000 } });
  setTimeout(() => sandbox.close(), 300);
  await assert.rejects(act, /closed/);
});
