import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import WebSocket from "ws";
import deviceRouter from "../src/routes/device";
import playerRouter from "../src/routes/player";
import { VERSION } from "@workspace/player-client";
import { authenticate, issueSession } from "../src/lib/identity";
import { createRoom, mutate, resolveRoom } from "../src/game/store";
import { startGame, startTicker } from "../src/game/engine";
import { attachSockets } from "../src/game/socket";
import { recordHumanActivity } from "../src/game/activity";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "../src/game/runtime-setup";
import type { Actor } from "../src/game/types";
// @ts-expect-error isolated SQL fixture only
import { fixtureDevices } from "@workspace/db";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(100); }
  assert.fail("Timed out waiting for client state");
}
const rpc = async (child: ChildProcess, type: string) => {
  const reply = once(child, "message"); child.send!({ type }); return (await reply)[0] as any;
};

test("two independent daemon processes approve through PKCE and play via real HTTP/WebSocket", { timeout: 90000 }, async () => {
  const children: ChildProcess[] = [];
  const app = express();
  app.use(express.json(), authenticate);
  app.use("/api", deviceRouter, playerRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 400).json({ error: "Request rejected" }));
  const server = createServer(app);
  attachSockets(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await initializeRuntimeAdapters();
    // A fresh process starts asleep until a human acts (see activity.ts).
    await recordHumanActivity();
    const actors: Actor[] = ["Host fixture", "Independent A", "Independent B"].map(name => ({ id: randomUUID(), name, kind: "human", scope: "browser" }));
    const room = await createRoom(actors[0]);
    await mutate(room.id, async draft => {
      Object.assign(draft.settings, { language: "typescript", grammarId: "typescript-agent-v1", objectType: "Int", startingEnergy: 100, startingObjectCount: 3,
        agentEnergyPerSecond: 1000, agentBatteryActs: 1000 });
      draft.members.push(...actors.slice(1).map(actor => ({ ...actor, ready: false })));
      await startGame(draft, actors[0]);
    });
    const clients: any[] = [];
    for (const actor of actors.slice(1)) {
      const child = fork(new URL("./client-daemon-integration.worker.mjs", import.meta.url), [`${base}/api/player/v1`], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
        execArgv: ["--experimental-transform-types"], stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      children.push(child);
      const ready = (await once(child, "message"))[0] as any;
      let cookie = "", csrf = "";
      const request = async (path: string, body?: unknown) => fetch(`${ready.origin}/player/daemon${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { origin: ready.origin, "content-type": "application/json", cookie, "x-csrf-token": csrf },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const ticket = new URL(ready.launch).hash.slice("#launch=".length);
      const login = await request("/session", { ticket });
      assert.equal(login.status, 200);
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await request("/session", { ticket })).status, 401, "launch is single-use");
      csrf = (await (await request("/session")).json()).csrf;
      // Exercise both canonical GUIDs and server-resolved Crockford aliases.
      const approval = await (await request("/approval", { roomId: clients.length ? room.id : room.shortCode.toLowerCase() })).json();
      assert.deepEqual(Object.keys(approval).sort(), ["userCode", "verificationUri"]);
      assert.equal(new URL(approval.verificationUri).origin, base);
      const device = [...fixtureDevices.values()].find((d: any) => d.code === approval.userCode) as any;
      assert.equal(device.room_id, room.id);
      assert.match(device.challenge, /^[A-Za-z0-9_-]{43}$/);
      const browser = await issueSession(actor as any, 60000);
      const approve = await fetch(`${base}/api/device/approve`, {
        method: "POST", headers: { authorization: `Bearer ${browser}`, "content-type": "application/json" },
        body: JSON.stringify({ code: approval.userCode }),
      });
      assert.equal(approve.status, 200);
      // Knowing a public code/device id and an incorrect verifier is insufficient.
      assert.equal((await fetch(`${base}/api/device/poll`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: device.id, deviceSecret: "wrong", verifier: "wrong" }) })).status, 400);
      await eventually(async () => {
        const data = await (await request("/approval/poll", {})).json();
        assert.deepEqual(Object.keys(data), ["status"]);
        return data.status === "approved";
      });
      await eventually(async () => (await rpc(child, "stats")).opens === 1);
      clients.push({ child, request, actor, pid: ready.pid, cookie, origin: ready.origin });
    }
    assert.notEqual(clients[0].pid, clients[1].pid);
    assert.notEqual(clients[0].origin, clients[1].origin);
    assert.equal((await fetch(`${clients[1].origin}/player/daemon/session`, { headers: { cookie: clients[0].cookie } })).status, 401);
    const unauthorized = new WebSocket(`${base.replace("http", "ws")}/api/rooms/${room.id}/ws`);
    const rejection = new Promise<number>(resolve => {
      unauthorized.once("unexpected-response", (_req, res) => { res.resume(); resolve(res.statusCode!); unauthorized.terminate(); });
      unauthorized.on("error", () => {});
    });
    assert.equal(await rejection, 401);
    const command = (type: string, extra = {}) => ({ version: VERSION, commandId: randomUUID(), command: { type, ...extra } });
    for (const client of clients) {
      const observation = await (await client.request("/observation")).json();
      assert.equal(observation.self.godId, client.actor.id);
      assert.equal(observation.agents.length, 0);
      const source = client === clients[0] ? "function agent(x) { return [add(1)]; }" : "function agent(x) { return [add(2)]; }";
      const validation = await (await client.request("/commands", command("validate", { language: "typescript", source }))).json();
      assert.equal(validation.accepted, true); assert.equal(validation.validation.cost, 11);
      assert.ok(validation.validation.expectedActCost > 0);
      const summon = command("summon", { language: "typescript", source });
      const receipt = await (await client.request("/commands", summon)).json();
      assert.equal(receipt.accepted, true);
      assert.deepEqual(await (await client.request("/commands", summon)).json(), receipt);
      assert.equal((await client.request("/commands", { ...summon, command: { type: "pause" } })).status, 409);
      await client.request("/commands", command("chat", { text: `Hello from ${client.actor.name}` }));
      await client.request("/commands", command("ready", { ready: true }));
      const own = await (await client.request("/observation")).json();
      assert.equal(own.agents.length, 1);
      assert.equal(own.agents[0].source, source);
      assert.ok((await rpc(client.child, "stats")).receipts >= 4, "commands received real WS receipts");
    }
    const sharedChat = await (await clients[0].request("/observation")).json();
    assert.ok(sharedChat.chat.some((entry: any) => entry.text === `Hello from ${clients[1].actor.name}`));
    await mutate(room.id, async draft => {
      const game = draft.game!;
      game.phase = "running";
      game.lastTick = Date.now();
      // Give the summoned agents energy now rather than waiting for world-time income.
      for (const agent of game.agents) agent.account = { balance: 100, settledWorldSeconds: game.worldSeconds };
    });
    // Production ticker is unref'd; the isolated authority process owns its lifetime.
    startTicker();
    await eventually(async () => resolveRoom(room.id).game!.events.some(event => event.type === "object.transformed"));
    await eventually(async () => (await rpc(clients[0].child, "stats")).transformations > 0);
    const before = await rpc(clients[0].child, "stats");
    await rpc(clients[0].child, "drop");
    await eventually(async () => (await rpc(clients[0].child, "stats")).opens > before.opens);
    await eventually(async () => (await rpc(clients[0].child, "stats")).observations > before.observations);
    const recovered = await (await clients[0].request("/observation")).json();
    assert.equal(recovered.self.godId, clients[0].actor.id);
    assert.ok(recovered.transformations.length > 0);
    assert.equal((await (await clients[0].request("/commands", command("chat", { text: "Reconnected" }))).json()).accepted, true);
    assert.equal((await clients[0].request("/disconnect", {})).status, 200);
    assert.equal((await clients[0].request("/observation")).status, 401);
    assert.equal((await clients[1].request("/observation")).status, 200);
  } finally {
    for (const child of children) { const exit = once(child, "exit"); child.kill(); await exit; }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    shutdownRuntimeAdapters();
  }
});
