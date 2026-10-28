import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import app from "../src/app";
import { issueSession, hash, type Identity } from "../src/lib/identity";
import { createRoom, mutate, resolveRoom } from "../src/game/store";
import { recordHumanActivity } from "../src/game/activity";
import { registerAdapters, unregisterAdapters, createUtilitiesAdapter } from "../src/game/adapters";
import { VERSION } from "@workspace/player-client";
// The runner substitutes isolated SQL and strips all live credentials.
// @ts-expect-error fixture-only exports
import { fixtureAgents, fixtureSessions } from "@workspace/db";

test("explicit owner grants are browser-owner-approved, room-bound, revocable and never implied by read/act", { timeout: 20000 }, async () => {
  const host: Identity = { id: randomUUID(), name: "Owner", kind: "human", scope: "browser" };
  const peer: Identity = { id: randomUUID(), name: "Peer", kind: "human", scope: "browser" };
  const third: Identity = { id: randomUUID(), name: "Third", kind: "human", scope: "browser" };
  const room = await createRoom(host), other = await createRoom(host);
  await mutate(room.id, async draft => {
    draft.members.push({ id: peer.id, name: peer.name, kind: "human", ready: false },
      { id: third.id, name: third.name, kind: "human", ready: false });
  });
  const browser = await issueSession(host, 60000), peerBrowser = await issueSession(peer, 60000);
  await recordHumanActivity();
  // No ticker, worker, model provider or paid call is started. Only this test's
  // in-memory authority exercises game lifecycle and player-command routing.
  registerAdapters({
    runtime: { languages: [room.settings.language], inspect: async () => ({ cost: 0 }), execute: async (_source, input) => input },
    utilities: createUtilitiesAdapter(),
  });
  const server = createServer(app);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  let requests = 0;
  const request = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++requests}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const initiate = async (permission: string) => {
    const verifier = "o".repeat(43), challenge = createHash("sha256").update(verifier).digest("base64url");
    const pending = await request("/device/request", { permission, roomId: room.id, challenge, clientLabel: "Owner regression assistant" });
    assert.equal(pending.status, 200);
    return { ...pending.body, verifier };
  };
  const proof = (pending: any) => ({ deviceId: pending.deviceId, deviceSecret: pending.deviceSecret, verifier: pending.verifier });
  const grant = async (permission: string) => {
    const pending = await initiate(permission);
    assert.equal((await request("/device/approve", { code: pending.userCode }, browser)).status, 200);
    const redeemed = await request("/device/poll", proof(pending));
    assert.equal(redeemed.status, 200);
    return redeemed.body;
  };
  const action = (token: string, input: Record<string, unknown>, roomId = room.id) =>
    request(`/rooms/${roomId}/actions`, { requestId: randomUUID(), ...input }, token);
  try {
    const pending = await initiate("owner");
    assert.equal((await request(`/device/details?code=${pending.userCode}`, undefined, peerBrowser)).body.canApprove, false);
    assert.equal((await request(`/device/details?code=${pending.userCode}`, undefined, browser)).body.canApprove, true);
    assert.equal((await request("/device/approve", { code: pending.userCode }, peerBrowser)).status, 403);
    assert.equal((await request("/device/deny", { code: pending.userCode }, peerBrowser)).status, 403);
    assert.equal((await request("/device/poll", proof(pending))).status, 202, "nonowner cannot decide the request");
    assert.equal((await request("/device/approve", { code: pending.userCode }, browser)).status, 200);
    const redeemed = await request("/device/poll", proof(pending));
    assert.equal(redeemed.status, 200);
    const owner = redeemed.body;
    assert.equal(owner.permission, "owner");
    assert.equal(owner.godId, host.id);
    assert.equal(owner.roomId, room.id);
    assert.equal(owner.expiresIn, 900);
    const stored = fixtureSessions.get(hash(owner.token));
    assert.equal(stored.data.scope, "player");
    assert.equal(stored.data.permission, "owner");
    assert.equal(stored.data.roomId, room.id);
    assert.ok(stored.expires.getTime() <= Date.now() + 900000);
    assert.equal((await request(`/rooms/${room.shortCode}`, undefined, owner.token)).status, 200);
    assert.equal((await request(`/rooms/${other.id}`, undefined, owner.token)).status, 403);
    assert.equal((await action(owner.token, { action: "start" }, other.id)).status, 403);
    assert.equal((await request(`/player/v1/rooms/${other.id}/observation`, undefined, owner.token)).status, 403);
    assert.equal((await request("/activity", {}, owner.token)).status, 200, "owner grant can wake the server");
    assert.equal((await request("/rooms", {}, owner.token)).status, 403, "owner does not mean room creation");
    assert.equal((await request("/admin/ai-agents", {}, owner.token)).status, 403, "owner does not mean global admin");
    const nested = await initiate("owner");
    assert.equal((await request(`/device/details?code=${nested.userCode}`, undefined, owner.token)).status, 403);
    assert.equal((await request("/device/approve", { code: nested.userCode }, owner.token)).status, 403, "only a browser can approve");

    const settings = { ...resolveRoom(room.id).settings, startingObjectCount: 1 };
    assert.equal((await action(owner.token, { action: "settings", revision: resolveRoom(room.id).revision, settings, aiBudget: 5 })).status, 200);
    assert.equal(resolveRoom(room.id).aiBudget, 5);
    assert.equal(resolveRoom(room.id).settings.startingObjectCount, 1);
    const agentId = randomUUID();
    fixtureAgents.set(agentId, { id: agentId, name: "Seat regression", provider: "openai", model: "gpt-4.1-mini",
      prompt: "Integration fixture only", revision: 1, created_at: new Date(), updated_at: new Date() });
    const library = await request("/ai-agents", undefined, owner.token);
    assert.equal(library.status, 200, "owner can read the existing public AI seat catalog");
    assert.deepEqual(library.body.agents, [{ id: agentId, name: "Seat regression", provider: "openai", model: "gpt-4.1-mini" }]);
    assert.equal((await action(owner.token, { action: "addAi", aiAgentId: agentId })).status, 200);
    const seat = resolveRoom(room.id).members.find(m => m.kind === "ai")!;
    assert.ok(seat);
    assert.equal((await action(owner.token, { action: "removeAi", deityId: seat.id })).status, 200);
    assert.ok(!resolveRoom(room.id).members.some(m => m.kind === "ai"), "no AI seat enters the test game");

    for (const permission of ["read", "act"]) {
      const limited = await grant(permission);
      for (const input of [
        { action: "settings", revision: resolveRoom(room.id).revision, settings, aiBudget: 10 },
        { action: "addAi", aiAgentId: agentId }, { action: "removeAi", deityId: host.id },
        { action: "start" }, { action: "resume" }, { action: "endGame" },
      ]) assert.equal((await action(limited.token, input)).status, 403, `${permission} cannot ${input.action}`);
      const ready = await action(limited.token, { action: "ready", ready: true });
      assert.equal(ready.status, permission === "read" ? 403 : 200);
    }
    assert.equal((await action(owner.token, { action: "ready", ready: false })).status, 200);
    assert.equal(resolveRoom(room.id).members.find(m => m.id === host.id)!.ready, false);
    assert.equal((await action(owner.token, { action: "chat", text: "Speaking as the approving human" })).status, 200);
    assert.equal(resolveRoom(room.id).chat.at(-1)!.authorId, host.id);
    assert.equal((await action(owner.token, { action: "start" })).status, 200);
    assert.equal(resolveRoom(room.id).game!.phase, "planning");
    const gameId = resolveRoom(room.id).game!.id;
    const summon = await request(`/player/v1/rooms/${room.id}/commands`, {
      version: VERSION, commandId: randomUUID(), gameId,
      command: { type: "summon", language: settings.language, source: "test-only identity adapter" },
    }, owner.token);
    assert.equal(summon.status, 200);
    assert.equal(summon.body.accepted, true);
    assert.equal(resolveRoom(room.id).game!.agents[0].ownerId, host.id, "owner plays as approving human");
    await mutate(room.id, async draft => { draft.game!.phase = "recovery"; });
    assert.equal((await action(owner.token, { action: "resume" })).status, 200);
    assert.equal(resolveRoom(room.id).game!.phase, "planning");
    assert.equal((await action(owner.token, { action: "endGame" })).status, 200);
    assert.equal(resolveRoom(room.id).game!.phase, "ended");

    const notOwner = await issueSession({ ...peer, scope: "player", roomId: room.id, permission: "owner" }, 60000);
    assert.equal((await action(notOwner, { action: "start" })).status, 403, "permission alone cannot impersonate the owner");
    const changed = await initiate("owner");
    assert.equal((await request("/device/approve", { code: changed.userCode }, browser)).status, 200);
    await mutate(room.id, async draft => { draft.ownerId = peer.id; });
    const sessionsBefore = fixtureSessions.size;
    assert.equal((await request("/device/poll", proof(changed))).status, 403, "ownership is rechecked at redemption");
    assert.equal(fixtureSessions.size, sessionsBefore, "failed redemption issues no session");
    assert.equal((await action(owner.token, { action: "start" })).status, 403, "ownership is rechecked at each owner action");
    await mutate(room.id, async draft => { draft.ownerId = host.id; });
    assert.equal((await request(`/device/grants/${owner.delegateId}/revoke`, {}, browser)).status, 200);
    assert.equal((await action(owner.token, { action: "start" })).status, 401);
    assert.equal((await request(`/rooms/${room.id}`, undefined, owner.token)).status, 401);
    const expiring = await grant("owner");
    fixtureSessions.get(hash(expiring.token)).expires = new Date(Date.now() - 1);
    assert.equal((await action(expiring.token, { action: "start" })).status, 401, "expired owner requires fresh approval");
    assert.equal((await request("/auth/user", undefined, browser)).status, 200, "browser is unaffected by delegated revocation");
  } finally {
    unregisterAdapters();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
