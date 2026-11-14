/**
 * The frame end of the panel bridge (src/frame/bridge-client.ts): one watch per hook call however many components
 * read it, stopped after the last, values routed by id, and nothing lost before the host's port arrives.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BridgeClient } from "../src/frame/bridge-client.ts";
import { PANEL_SDK } from "../src/sdk/panel.ts";

const tick = () => new Promise(r => setTimeout(r, 5));
/** Waits for messages to cross the ports (slower when the suite runs in parallel). */
async function until(ok: () => boolean) {
  for (const end = Date.now() + 2000; !ok() && Date.now() < end;) await tick();
}

function connected(t: { after(fn: () => void): void }) {
  const parent: unknown[] = [];
  const client = new BridgeClient("n1", { postMessage: m => parent.push(m) });
  const channel = new MessageChannel();
  const sent: Record<string, unknown>[] = [];
  channel.port2.onmessage = e => sent.push(e.data);
  const host: unknown[] = [];
  // Open ports keep the test process alive, so they close however the test ends.
  t.after(() => { channel.port1.close(); channel.port2.close(); });
  return { client, parent, sent, host, attach: () => client.attach(channel.port1, m => host.push(m)), toFrame: (m: unknown) => channel.port2.postMessage(m) };
}

test("ready names the SDK version and the nonce", t => {
  const c = connected(t);
  c.client.ready();
  assert.deepEqual(c.parent, [{ type: "ready", sdk: PANEL_SDK, nonce: "n1" }]);
});

test("two readers of one hook call share one watch, stopped after the last; values reach both", async t => {
  const c = connected(t);
  c.attach();
  const w = c.client.watch("useGame", []);
  assert.equal(c.client.watch("useGame", []), w, "the same call is the same watch");
  let seen = 0;
  const stopA = w.subscribe(() => seen++);
  const stopB = w.subscribe(() => seen++);
  await until(() => c.sent.length >= 1);
  assert.deepEqual(c.sent.map(m => m.type), ["watch"]);
  const id = c.sent[0]!.id;
  c.toFrame({ type: "value", id, value: { phase: "live" } });
  await until(() => seen >= 2);
  assert.deepEqual(w.get(), { value: { phase: "live" } });
  assert.equal(seen, 2);
  stopA();
  await tick();
  assert.deepEqual(c.sent.map(m => m.type), ["watch"], "still read by one");
  stopB();
  await until(() => c.sent.length >= 2);
  assert.deepEqual(c.sent.map(m => m.type), ["watch", "unwatch"]);
  assert.ok(c.sent.every(m => m.nonce === "n1"));
});

test("an error for a watch becomes its snapshot; other messages go to the runtime", async t => {
  const c = connected(t);
  c.attach();
  const w = c.client.watch("useMyObject", ["o1"]);
  w.subscribe(() => {});
  await until(() => c.sent.length >= 1);
  c.toFrame({ type: "error", id: c.sent[0]!.id, message: "No such line." });
  c.toFrame({ type: "load", panel: { slug: "x", version: 2, compiled: "", title: "x" } });
  await until(() => c.host.length >= 1 && w.get().error !== undefined);
  assert.deepEqual(w.get(), { error: "No such line." });
  assert.deepEqual(c.host.map(m => (m as { type: string }).type), ["load"]);
});

test("messages before the port arrives are sent when it does; more asks for a clamped page", async t => {
  const c = connected(t);
  const w = c.client.watch("useMoves", [30]);
  w.subscribe(() => {});
  w.more(10_000);
  c.attach();
  await until(() => c.sent.length >= 2);
  assert.deepEqual(c.sent.map(m => m.type), ["watch", "more"]);
  assert.equal(c.sent[1]!.n, 100);
});
