/**
 * The host side of the panel bridge (src/shell/bridge-host.ts): what a sandboxed panel may ask for and how often
 * it hears back. Timers are fake, so every time below is exact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { acceptMessage, BridgeHost, type HostDeps } from "../src/shell/bridge-host.ts";
import type { HostMessage } from "../src/sdk/bridge-protocol.ts";

function fakeClock() {
  let now = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    timers: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: now + ms, fn, id }); return id; },
      clearTimeout: (id: unknown) => { timers = timers.filter(t => t.id !== id); },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter(t => t !== due);
        now = due.at;
        due.fn();
      }
      now = end;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const posted: HostMessage[] = [];
  const watches: { name: string; args: Record<string, unknown>; push: (v: unknown) => void; fail: (m: string) => void; stopped: boolean }[] = [];
  const deps: HostDeps = {
    roomId: "room-1",
    post: m => posted.push(m),
    watch(name, args, onValue, onError) {
      const w = { name, args, push: onValue, fail: onError, stopped: false };
      watches.push(w);
      return () => { w.stopped = true; };
    },
    command: async envelope => ({ accepted: true, message: `ran ${(envelope as { command: { type: string } }).command.type}` }) as never,
    calibration: async () => ({ key: "k", settings: {}, utility: {}, reward: {} }) as never,
    timers: clock.timers,
  };
  return { host: new BridgeHost(deps), posted, watches, clock };
}
const data = (posted: HostMessage[]) => posted.filter(m => m.type === "data").map(m => (m as { value: unknown }).value);

test("a subscription is throttled to its hz: the first value at once, then the latest value per period", () => {
  const { host, posted, watches, clock } = setup();
  host.receive({ type: "subscribe", id: "s1", name: "player.observation", args: { roomId: "room-1" }, hz: 1 });
  const w = watches[0];
  w.push("a");                       // t=0: sent at once
  clock.advance(100); w.push("b");   // held
  clock.advance(100); w.push("c");   // replaces b
  assert.deepEqual(data(posted), ["a"]);
  clock.advance(799);                // t=999
  assert.deepEqual(data(posted), ["a"]);
  clock.advance(1);                  // t=1000: the latest value only
  assert.deepEqual(data(posted), ["a", "c"]);
  clock.advance(5000); w.push("d");  // quiet for longer than a period: at once
  assert.deepEqual(data(posted), ["a", "c", "d"]);
});

test("hz is clamped to 5 (200 ms) however fast a panel asks", () => {
  const { host, posted, watches, clock } = setup();
  host.receive({ type: "subscribe", id: "s1", name: "player.observation", args: {}, hz: 1000 });
  watches[0].push(1);
  clock.advance(50); watches[0].push(2);
  clock.advance(149);
  assert.deepEqual(data(posted), [1]);
  clock.advance(1);
  assert.deepEqual(data(posted), [1, 2]);
});

test("only the SDK's read queries are allowed, always for the current room", () => {
  const { host, posted, watches } = setup();
  host.receive({ type: "subscribe", id: "s1", name: "player.observation", args: { roomId: "someone-elses-room" } });
  host.receive({ type: "subscribe", id: "s2", name: "rooms.get", args: { room: "XYZ1" } });
  host.receive({ type: "subscribe", id: "s3", name: "player.events", args: { roomId: "x", limit: 500, extra: true } });
  host.receive({ type: "subscribe", id: "s4", name: "auth.credentials.list", args: {} });
  host.receive({ type: "subscribe", id: "s5", name: "panels.code", args: { slug: "other" } });
  assert.deepEqual(watches.map(w => [w.name, w.args]), [
    ["player.observation", { roomId: "room-1" }],
    ["rooms.get", { room: "room-1" }],
    ["player.events", { roomId: "room-1", limit: 50 }],
  ]);
  const errors = posted.filter(m => m.type === "error") as { id: string; message: string }[];
  assert.deepEqual(errors.map(e => e.id), ["s4", "s5"]);
  assert.match(errors[0].message, /not available/);
});

test("unsubscribe and dispose stop the underlying watches; late values are not posted", () => {
  const { host, posted, watches } = setup();
  host.receive({ type: "subscribe", id: "s1", name: "player.observation", args: {} });
  host.receive({ type: "subscribe", id: "s2", name: "player.myUtility", args: {} });
  host.receive({ type: "unsubscribe", id: "s1" });
  assert.equal(watches[0].stopped, true);
  assert.equal(watches[1].stopped, false);
  watches[0].push("late");
  assert.deepEqual(data(posted), []);
  host.dispose();
  assert.equal(watches[1].stopped, true);
  watches[1].push("later");
  assert.deepEqual(data(posted), []);
  host.receive({ type: "subscribe", id: "s3", name: "player.observation", args: {} });
  assert.equal(watches.length, 2, "a disposed host takes no new subscriptions");
});

test("a re-used subscription id replaces the old watch instead of leaking it", () => {
  const { host, watches } = setup();
  host.receive({ type: "subscribe", id: "s1", name: "player.observation", args: {} });
  host.receive({ type: "subscribe", id: "s1", name: "player.myUtility", args: {} });
  assert.equal(watches[0].stopped, true);
  assert.equal(watches[1].stopped, false);
});

test("commands and calibration answer by request id", async () => {
  const { host, posted } = setup();
  host.receive({ type: "command", id: "c1", envelope: { command: { type: "validate" } } });
  host.receive({ type: "calibration", id: "k1" });
  await new Promise(resolve => setImmediate(resolve));
  const results = posted.filter(m => m.type === "result") as { id: string; ok: boolean; value: { message?: string; key?: string } }[];
  assert.deepEqual(results.map(r => [r.id, r.ok]), [["c1", true], ["k1", true]]);
  assert.equal(results[0].value.message, "ran validate");
});

test("messages from any window but this frame, or without the boot nonce, are dropped", () => {
  const frame = {}, other = {};
  const ok = { type: "subscribe", id: "s", name: "player.observation", args: {}, nonce: "n-1" };
  assert.deepEqual(acceptMessage({ source: frame, data: ok }, frame, "n-1"), ok);
  assert.equal(acceptMessage({ source: other, data: ok }, frame, "n-1"), null);
  assert.equal(acceptMessage({ source: null, data: ok }, frame, "n-1"), null);
  assert.equal(acceptMessage({ source: frame, data: { ...ok, nonce: "guess" } }, frame, "n-1"), null);
  assert.equal(acceptMessage({ source: frame, data: "not an object" }, frame, "n-1"), null);
  assert.equal(acceptMessage({ source: frame, data: { nonce: "n-1", type: 7 } }, frame, "n-1"), null);
});
