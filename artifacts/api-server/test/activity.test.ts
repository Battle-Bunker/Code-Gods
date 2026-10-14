import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import type { WebSocket } from "ws";
import {
  createActivityClock, INACTIVITY_MS, initializeActivity, isServerActive,
  isLocallyIdle, recordHumanActivity, attachConnectionLifecycle, closeIdleSocket,
} from "../src/game/activity.ts";

test("new boot stays inactive; passive checks never wake it", async () => {
  await initializeActivity();
  assert.equal(await isServerActive(), false);
  assert.equal(isLocallyIdle(), true);
  for (let i = 0; i < 100; i++) assert.equal(await isServerActive(), false);
});

test("monotonic human deadline expires at exactly thirty minutes", () => {
  let now = 100;
  const activity = createActivityClock(() => now);
  assert.equal(activity.isIdle(), true);
  activity.record();
  assert.equal(activity.remaining(), INACTIVITY_MS);
  now += INACTIVITY_MS - 1;
  assert.equal(activity.isIdle(), false);
  now++;
  assert.equal(activity.isIdle(), true);
  assert.equal(activity.remaining(), 0);
});

test("reads, heartbeats, and bot work do not extend the deadline", () => {
  let now = 0;
  const activity = createActivityClock(() => now);
  activity.record();
  for (let minute = 1; minute <= 30; minute++) {
    now = minute * 60000;
    activity.isIdle();
    activity.remaining();
  }
  assert.equal(activity.isIdle(), true);
  activity.record();
  assert.equal(activity.isIdle(), false);
  now += INACTIVITY_MS;
  assert.equal(activity.isIdle(), true);
});

test("a second actual interaction replaces the previous deadline", () => {
  let now = 0;
  const activity = createActivityClock(() => now);
  activity.record();
  now += INACTIVITY_MS - 1;
  activity.record();
  now += 1;
  assert.equal(activity.isIdle(), false);
  now += INACTIVITY_MS - 1;
  assert.equal(activity.isIdle(), true);
});

test("connection lifecycle is attached once and preserves active requests", () => {
  const server = new EventEmitter() as EventEmitter & { closeIdleConnections: () => void };
  let closed = 0;
  server.closeIdleConnections = () => { closed++; };
  attachConnectionLifecycle(server as unknown as Server);
  attachConnectionLifecycle(server as unknown as Server);
  assert.equal(server.listenerCount("connection"), 1);
  const socket = new EventEmitter();
  server.emit("connection", socket as Socket);
  const response = new EventEmitter();
  server.emit("request", { socket }, response);
  assert.equal(closed, 0);
  response.emit("finish");
  assert.equal(closed, 1);
  response.emit("close");
  assert.equal(closed, 1);
  socket.emit("close");
  server.emit("close");
});

test("explicit authenticated activity contract wakes the central registry", async () => {
  const before = Date.now();
  const state = await recordHumanActivity();
  assert.equal(state.active, true);
  assert.ok(state.idleDeadline >= before + INACTIVITY_MS - 10);
  assert.equal(await isServerActive(), true);
  assert.equal(isLocallyIdle(), false);
});

test("idle websocket closes with client-visible 4008, without immediate termination", () => {
  const ws = new EventEmitter() as EventEmitter & {
    close: (code: number, reason: string) => void; terminate: () => void; readyState: number;
  };
  let calls = 0;
  ws.readyState = 1;
  ws.close = (code, reason) => {
    assert.equal(code, 4008);
    assert.equal(reason, "SERVER_IDLE");
    calls++;
  };
  ws.terminate = () => assert.fail("must allow the close handshake grace period");
  closeIdleSocket(ws as unknown as WebSocket);
  closeIdleSocket(ws as unknown as WebSocket);
  assert.equal(calls, 1);
  ws.readyState = 3;
  ws.emit("close");
});

test("shutdown bounds raw connection drain without destroying admitted writes", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const server = new EventEmitter() as EventEmitter & { closeIdleConnections: () => void };
  server.closeIdleConnections = () => {};
  const dispose = attachConnectionLifecycle(server as unknown as Server);
  assert.equal(attachConnectionLifecycle(server as unknown as Server), dispose);
  const raw = new EventEmitter() as EventEmitter & { destroy: () => void };
  const writing = new EventEmitter() as EventEmitter & { destroy: () => void };
  let rawDestroyed = false;
  raw.destroy = () => { rawDestroyed = true; raw.emit("close"); };
  writing.destroy = () => assert.fail("an admitted write must be allowed to persist");
  server.emit("connection", raw);
  server.emit("connection", writing);
  const response = new EventEmitter();
  server.emit("request", { socket: writing }, response);
  dispose();
  dispose();
  context.mock.timers.tick(9999);
  assert.equal(rawDestroyed, false);
  context.mock.timers.tick(1);
  assert.equal(rawDestroyed, true);
  response.emit("finish");
  writing.emit("close");
  server.emit("close");
  assert.equal(server.listenerCount("connection"), 0);
  assert.equal(server.listenerCount("request"), 0);
  assert.equal(server.listenerCount("upgrade"), 0);
});
