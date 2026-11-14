/**
 * An agent reaches nothing but the host channel: no network, no file system, no process, no real clock or entropy
 * (the clock is the virtual one of spec §6.5's determinism: 2026-01-01T00:00:00Z, 1 µs per read).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FakeHost } from "../src/index.ts";
import { probes, sandboxes } from "./helpers.ts";

const boxes = sandboxes();
after(() => boxes.close());
const host = () => new FakeHost({ line: { m: 1, c: 1 }, rule: { family: "m-meets-c", params: {} } });

test("python: no network, file system, process or extra modules; the clock is virtual", async () => {
  const source = `
import time
def attempt(f):
    try:
        f()
        return "reached"
    except BaseException as e:
        return str(type(e)).split("'")[1]

def socket_():
    import socket
def os_():
    import os
def subprocess_():
    import subprocess
def urllib_():
    import urllib.request
def sys_():
    import sys
def io_():
    import io
def ctypes_():
    import ctypes
def file_():
    open("/etc/passwd")

def agent(offer):
    out = [call("probe", r=attempt(f)) for f in (socket_, os_, subprocess_, urllib_, sys_, io_, ctypes_, file_)]
    out.append(call("probe", r="time:" + str(int(time.time()))))
    out.append(call("probe", r="sleep:" + attempt(lambda: time.sleep(1))))
    return out
`;
  const result = await (await boxes.get("python")).act({ source, offer: { object: 0 }, seed: "1", host: host() });
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;
  assert.deepEqual(probes(result.calls), [
    "ImportError", "ImportError", "ImportError", "ImportError", "ImportError", "ImportError", "ImportError", "NameError",
    "time:1767225600", "sleep:RuntimeError",
  ]);
  assert.equal(result.transcript.length, 0, "nothing reaches the host but the channel, and this agent used none");
});

test("python: names that reach past the guest library are refused before the agent runs", async () => {
  for (const source of [
    "def agent(offer):\n    return __host('{\"op\":\"budget\"}')\n",
    "def agent(offer):\n    return ().__class__.__base__.__subclasses__()\n",
    "def agent(offer):\n    return getattr(offer, 'x')\n",
  ]) {
    const result = await (await boxes.get("python")).act({ source, offer: { object: 0 }, seed: "1", host: host() });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "COMPILE", result.error);
  }
});

test("typescript: no network, module system, process or timers; the clock is virtual", async () => {
  const source = `
function agent(offer: Offer) {
  const g = globalThis as any;
  const names = ["fetch", "XMLHttpRequest", "WebSocket", "require", "process", "Deno", "Bun", "std", "os", "setTimeout", "setInterval", "WebAssembly"];
  const out = names.map(n => call("probe", { r: n + ":" + typeof g[n] }));
  out.push(call("probe", { r: "now:" + Date.now() }));
  out.push(call("probe", { r: "year:" + new Date().getUTCFullYear() }));
  out.push(call("probe", { r: "perf:" + (performance.now() < 1) }));
  return out;
}`;
  const result = await (await boxes.get("typescript")).act({ source, offer: { object: 0 }, seed: "1", host: host() });
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;
  const seen = probes(result.calls);
  for (const line of seen.slice(0, 12)) assert.match(line, /:undefined$/);
  assert.match(seen[12], /^now:17672256000\d\d$/);
  assert.deepEqual(seen.slice(13), ["year:2026", "perf:true"]);
});

test("typescript: a raw request on the channel is still only a host request", async () => {
  const source = `function agent(offer: Offer) {
  const g = globalThis as any;
  return [call("probe", { r: g.__host("not json") }), call("probe", { r: g.__host(JSON.stringify({ op: "budget" })) })];
}`;
  const h = host();
  const result = await (await boxes.get("typescript")).act({ source, offer: { object: 0 }, seed: "1", host: h });
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;
  const [bad, good] = probes(result.calls).map(r => JSON.parse(r));
  assert.deepEqual(bad, { ok: false, error: "the request is not JSON" });
  assert.equal(good.ok, true);
  assert.equal(h.calls, 1);
});
