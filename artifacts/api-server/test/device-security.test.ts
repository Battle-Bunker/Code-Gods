import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import { WebSocket } from "ws";
import app from "../src/app";
import { issueSession, hash, type Identity } from "../src/lib/identity";
import { createRoom, mutate, resolveRoom } from "../src/game/store";
import { attachSockets } from "../src/game/socket";
import { recordHumanActivity } from "../src/game/activity";
// The runner supplies an isolated SQL fixture, never production credentials.
// @ts-expect-error fixture-only exports
import { fixtureDevices, fixtureSessions, fixtureStats } from "@workspace/db";

test("delegated authorization lifecycle, permissions and passive invalidation", { timeout: 20000 }, async () => {
  const host: Identity = { id: randomUUID(), name: "Owner", kind: "human", scope: "browser" };
  const peer: Identity = { id: randomUUID(), name: "Peer", kind: "human", scope: "browser" };
  const outsider: Identity = { id: randomUUID(), name: "Outsider", kind: "human", scope: "browser" };
  const room = await createRoom(host), other = await createRoom(host);
  await mutate(room.id, async draft => { draft.members.push({ id: peer.id, name: peer.name, kind: "human", ready: false }); });
  await recordHumanActivity();
  const hostToken = await issueSession(host, 60000), peerToken = await issueSession(peer, 60000), outsiderToken = await issueSession(outsider, 60000);
  const server = createServer(app), closeSockets = attachSockets(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let requestNumber = 0;
  const request = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(`${base}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${++requestNumber}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const initiate = async (permission?: string) => {
    const verifier = "a".repeat(43), challenge = createHash("sha256").update(verifier).digest("base64url");
    const result = await request("/device/request", { roomId: room.shortCode.toLowerCase(), challenge, clientLabel: "Self-reported assistant", ...(permission ? { permission } : {}) });
    assert.equal(result.status, 200);
    return { ...result.body, verifier };
  };
  const credentials = (grant: any) => ({ deviceId: grant.deviceId, deviceSecret: grant.deviceSecret, verifier: grant.verifier });
  const approve = async (grant: any, token = hostToken) => request("/device/approve", { code: grant.userCode }, token);
  const poll = async (grant: any) => request("/device/poll", credentials(grant));
  const grant = async (permission: string) => {
    const pending = await initiate(permission);
    assert.equal((await approve(pending)).status, 200);
    const redeemed = await poll(pending);
    assert.equal(redeemed.status, 200);
    return { ...pending, ...redeemed.body };
  };
  const sockets: WebSocket[] = [];
  const connect = async (token: string, roomId = room.id) => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/rooms/${roomId}/ws`, { headers: { authorization: `Bearer ${token}` } });
    sockets.push(ws);
    await once(ws, "open");
    return ws;
  };
  const wsCommand = async (ws: WebSocket, input: unknown) => {
    const result = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { ws.off("message", listener); reject(new Error("No command result")); }, 2000);
      const listener = (data: any) => {
        const event = JSON.parse(String(data));
        if (event.type === "command.receipt" || event.type === "command.error") {
          clearTimeout(timer); ws.off("message", listener); resolve(event);
        }
      };
      ws.on("message", listener);
    });
    ws.send(JSON.stringify(input));
    return result;
  };
  const envelope = (command = { type: "ready", ready: true }) => ({ version: "1", commandId: randomUUID(), command });
  // Derive actual SDK protocol version instead of relying on wire assumptions.
  const { VERSION } = await import("@workspace/player-client");
  const ready = () => ({ ...envelope(), version: VERSION });
  try {
    const pending = await initiate();
    assert.equal(pending.permission, "act", "legacy requests default to act");
    assert.equal(pending.delegateId, pending.deviceId);
    assert.equal((await request(`/device/details?code=${pending.userCode}`)).status, 401);
    assert.equal((await request(`/device/details?code=${pending.userCode}`, undefined, outsiderToken)).status, 403);
    const details = await request(`/device/details?code=${pending.userCode}`, undefined, hostToken);
    assert.deepEqual(Object.keys(details.body).sort(), ["canApprove", "clientLabel", "expiresAt", "permission", "roomCode", "roomId", "status"].sort());
    assert.equal(details.body.canApprove, true);
    assert.equal(details.body.roomId, room.id);
    assert.equal(details.body.roomCode, room.shortCode);
    assert.equal(details.body.clientLabel, "Self-reported assistant");
    assert.equal(details.body.status, "pending");
    assert.equal((await poll(pending)).status, 202);
    assert.equal((await approve(pending, outsiderToken)).status, 403);
    assert.equal((await approve(pending)).status, 200);
    assert.equal((await request(`/device/details?code=${pending.userCode}`, undefined, peerToken)).status, 403);
    assert.equal((await approve(pending, peerToken)).status, 400, "approval cannot be stolen");
    assert.equal((await request("/device/poll", { ...credentials(pending), verifier: "wrong" })).status, 400);
    assert.equal((await request("/device/poll", { ...credentials(pending), deviceSecret: "wrong" })).status, 400);
    const redeemed = await poll(pending);
    assert.equal(redeemed.status, 200);
    assert.equal((await poll(pending)).status, 400, "PKCE redemption is single-use");
    const persisted = fixtureSessions.get(hash(redeemed.body.token)).data;
    assert.equal(persisted.delegateId, pending.deviceId);
    assert.equal(persisted.permission, "act");
    assert.equal(persisted.scope, "player");
    assert.equal(persisted.clientLabel, details.body.clientLabel);
    assert.equal((await request(`/player/v1/rooms/${other.id}/observation`, undefined, redeemed.body.token)).status, 403);
    assert.deepEqual((await request("/rooms", undefined, redeemed.body.token)).body.map((r: any) => r.id), [room.id]);
    assert.equal((await request(`/rooms/${room.id}/actions`, { action: "start", requestId: randomUUID() }, redeemed.body.token)).status, 403, "owner's delegate has no host powers");
    const denied = await initiate("read");
    assert.equal((await request("/device/deny", { code: denied.userCode }, hostToken)).body.status, "denied");
    assert.equal((await poll(denied)).body.status, "denied");
    const cancelled = await initiate("read");
    assert.equal((await request("/device/cancel", { ...credentials(cancelled), verifier: "wrong" })).status, 400);
    assert.equal((await request("/device/cancel", credentials(cancelled))).status, 200);
    assert.equal((await approve(cancelled)).status, 400);
    const expiredRequest = await initiate();
    fixtureDevices.get(expiredRequest.deviceId).expires = new Date(Date.now() - 1);
    assert.equal((await approve(expiredRequest)).status, 400);
    assert.equal((await poll(expiredRequest)).body.status, "expired");

    const read = await grant("read"), act = await grant("act");
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, read.token)).body.self.godId, host.id);
    for (const [path, body] of [
      [`/player/v1/rooms/${room.id}/commands`, ready()],
      [`/rooms/${room.id}/actions`, { action: "ready", requestId: randomUUID(), ready: true }],
      ["/rooms", {}], ["/activity", {}], ["/admin/ai-agents", {}],
    ] as const) assert.equal((await request(path, body, read.token)).status, 403, path);
    assert.equal((await request("/device/approve", { code: "ignored" }, act.token)).status, 403);
    assert.equal((await request("/device/grants", undefined, act.token)).status, 403);
    const readWs = await connect(read.token), actWs = await connect(act.token), browserWs = await connect(hostToken);
    const sdkCommands = ["ready", "chat", "validate", "summon", "pause"].map(type => ({ version: VERSION, commandId: randomUUID(), command: { type } }));
    const legacyCommands = ["ready.set", "chat.send", "agent.validate", "agent.summon", "pause.use", "start"].map(command => ({ protocolVersion: 1, command, requestId: randomUUID(), payload: { ready: true } }));
    for (const input of [...sdkCommands, ...legacyCommands]) {
      const receipt = await wsCommand(readWs, input);
      assert.equal(receipt.type, "command.error");
      assert.match(receipt.payload.error, /Read-only/);
    }
    assert.equal(resolveRoom(room.id).members.find(m => m.id === host.id)!.ready, false);
    assert.equal((await wsCommand(actWs, ready())).payload.accepted, true);
    assert.equal((await request(`/device/grants/${read.delegateId}/revoke`, {}, peerToken)).status, 404);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, read.token)).status, 200);
    const grants = (await request("/device/grants", undefined, hostToken)).body.grants;
    assert.ok(grants.some((g: any) => g.delegateId === read.delegateId && g.permission === "read"));
    assert.equal((await request("/device/grants", undefined, peerToken)).body.grants.length, 0);
    const reads = fixtureStats.sessionReads;
    for (let i = 0; i < 3; i++) await mutate(room.id, async draft => { draft.revision++; });
    assert.equal(fixtureStats.sessionReads, reads, "private event fanout performs no session SQL lookups");
    // Let all pre-revocation frames arrive before measuring post-revocation delivery.
    await new Promise(resolve => setTimeout(resolve, 20));
    let afterRevoke = 0;
    readWs.on("message", () => afterRevoke++);
    const closed = once(readWs, "close");
    assert.equal((await request(`/device/grants/${read.delegateId}/revoke`, {}, hostToken)).status, 200);
    assert.equal((await closed)[0], 1008, "passive socket closes immediately on revocation");
    await mutate(room.id, async draft => { draft.revision++; });
    assert.equal(afterRevoke, 0, "no private push after revocation");
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, read.token)).status, 401);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, act.token)).status, 200);
    assert.equal(browserWs.readyState, WebSocket.OPEN, "unrelated human session survives");
    const actClosed = once(actWs, "close");
    assert.equal((await request("/device/cancel", credentials(act))).status, 200, "cancellation also revokes an already-redeemed session");
    assert.equal((await actClosed)[0], 1008);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, act.token)).status, 401);

    const short = await issueSession({ ...host, scope: "player", roomId: room.id, permission: "read", delegateId: randomUUID() }, 200);
    const shortWs = await connect(short);
    let postExpiry = 0;
    shortWs.on("message", () => { if (fixtureSessions.get(hash(short)).expires <= Date.now()) postExpiry++; });
    const deadlineClosed = once(shortWs, "close");
    assert.equal((await deadlineClosed)[0], 1008, "passive expiry needs no incoming messages or game event");
    await mutate(room.id, async draft => { draft.revision++; });
    assert.equal(postExpiry, 0);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, undefined, short)).status, 401);
    const selfRevoked = await grant("read");
    const selfWs = await connect(selfRevoked.token), selfClosed = once(selfWs, "close");
    assert.equal((await request("/device/revoke", {}, selfRevoked.token)).status, 200);
    assert.equal((await selfClosed)[0], 1008);
    assert.equal((await request("/device/revoke", {}, hostToken)).status, 403, "bearer revoke cannot revoke browser identity");
    const wrongRoom = new WebSocket(`${base.replace("http", "ws")}/api/rooms/${other.id}/ws`, { headers: { authorization: `Bearer ${redeemed.body.token}` } });
    wrongRoom.on("error", () => {});
    const rejection = new Promise<number>(resolve => wrongRoom.on("unexpected-response", (_req, res) => { res.resume(); resolve(res.statusCode!); wrongRoom.terminate(); }));
    assert.equal(await rejection, 401);
  } finally {
    for (const ws of sockets) ws.terminate();
    await closeSockets();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
