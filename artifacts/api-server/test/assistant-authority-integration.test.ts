import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import { issueSession, type Identity } from "../src/lib/identity";
import { createRoom, mutate, resolveRoom } from "../src/game/store";
import { attachSockets } from "../src/game/socket";
import { recordHumanActivity } from "../src/game/activity";
import { createAssistant } from "../../../lib/player-client/src/assistant";
import { nodeSocketFactory } from "../../../lib/player-client/src/node-socket";
import { VERSION } from "@workspace/player-client";

async function eventually(check: () => Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  throw new Error("Assistant authority integration timed out");
}

test("actual assistant uses HTTP PKCE and real sockets for read/act approval, observation, receipts and revocation", { timeout: 20000 }, async () => {
  const owner: Identity = { id: randomUUID(), name: "Human with assistant", kind: "human", scope: "browser" };
  const room = await createRoom(owner), browser = await issueSession(owner, 60000);
  await recordHumanActivity();
  const server = createServer(app), disposeSockets = attachSockets(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const loopback = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const authority = "https://assistant-authority.test";
  let socketCommands = 0, httpCommands = 0, opens = 0;
  // Adapt only TLS/address routing for the isolated fixture. Every response and
  // socket frame comes from the production Express routes and authority code.
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, authority);
    assert.equal(init?.redirect, "error", "assistant refuses authority redirects");
    assert.equal(new Headers(init?.headers).get("cookie"), null, "no browser cookie enters the assistant");
    if (url.pathname.endsWith("/commands")) httpCommands++;
    const response = await fetch(`${loopback}${url.pathname}${url.search}`, init);
    return response;
  };
  const makeAssistant = () => createAssistant({
    fetcher,
    socketFactory: (input, options) => {
      const url = new URL(input);
      assert.equal(url.origin, authority.replace("https:", "wss:"));
      assert.deepEqual(Object.keys(options.headers), ["Authorization"]);
      assert.match(options.headers.Authorization, /^Bearer /);
      const socket = nodeSocketFactory(`${loopback.replace("http:", "ws:")}${url.pathname}`, options);
      const send = socket.send.bind(socket);
      socket.send = data => { socketCommands++; send(data); };
      let onopen: typeof socket.onopen = null;
      Object.defineProperty(socket, "onopen", {
        get: () => () => { opens++; onopen?.(); },
        set: value => { onopen = value; },
      });
      return socket;
    },
  });
  const read = makeAssistant(), act = makeAssistant();
  const local = async (assistant: ReturnType<typeof makeAssistant>, op: string, args?: unknown): Promise<any> =>
    assistant.handle({ op, ...(args === undefined ? {} : { args }) });
  const browserRequest = async (path: string, body?: unknown) => {
    const response = await fetch(`${loopback}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${browser}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    for (const [assistant, permission] of [[read, "read"], [act, "act"]] as const) {
      const approval = await local(assistant, "connect", {
        url: `${authority}/player/?room=${room.shortCode.toLowerCase()}`,
        permission, clientLabel: `Integration ${permission} self-reported`,
      });
      assert.deepEqual(Object.keys(approval).sort(), ["approvalUrl", "comparisonCode", "permission", "room"]);
      assert.equal(approval.room, room.id);
      assert.equal(approval.permission, permission);
      assert.equal(new URL(approval.approvalUrl).origin, authority);
      const details = await browserRequest(`/device/details?code=${approval.comparisonCode}`);
      assert.equal(details.permission, permission);
      assert.equal(details.roomCode, room.shortCode);
      assert.equal((await local(assistant, "status")).state, "approval_pending");
      await browserRequest("/device/approve", { code: approval.comparisonCode });
    }
    await eventually(async () => (await local(read, "status")).state === "connected" && (await local(act, "status")).state === "connected");
    assert.equal(opens, 2, "both assistants own a real authenticated upstream socket");
    for (const assistant of [read, act]) {
      const result = await local(assistant, "observation");
      assert.equal(result.observation.self.godId, owner.id);
      assert.equal(result.observation.roomId, room.id);
      assert.match(result.untrustedContent, /untrusted/);
    }
    const envelope = { version: VERSION, commandId: randomUUID(), command: { type: "ready", ready: true } };
    assert.ok((await local(read, "command", { envelope })).error);
    assert.equal(socketCommands, 0, "read-only assistant never dispatches the command");
    const readGrant = (await browserRequest("/device/grants")).grants.find((grant: any) => grant.permission === "read");
    assert.ok(readGrant);
    await browserRequest(`/device/grants/${readGrant.delegateId}/revoke`, {});
    await eventually(async () => (await local(read, "status")).state === "reapproval_required");
    assert.ok((await local(read, "observation")).error);

    const receipt = await local(act, "command", { envelope });
    assert.equal(receipt.status, "received");
    assert.equal(receipt.result.accepted, true);
    assert.equal(receipt.result.commandId, envelope.commandId);
    assert.equal(socketCommands, 1);
    assert.equal(httpCommands, 0, "receipt came from WebSocket, not HTTP fallback");
    assert.deepEqual(await local(act, "receipt", { commandId: envelope.commandId }), receipt);
    assert.deepEqual(await local(act, "command", { envelope }), receipt);
    assert.equal(socketCommands, 1, "cached receipt prevents implicit duplicate dispatch");
    assert.equal(resolveRoom(room.id).members.find(m => m.id === owner.id)!.ready, true);
    assert.ok((await local(act, "events")).events.some((event: any) => event.type === "command.receipt"));

    const grants = (await browserRequest("/device/grants")).grants;
    const actGrant = grants.find((grant: any) => grant.permission === "act");
    assert.ok(actGrant);
    await browserRequest(`/device/grants/${actGrant.delegateId}/revoke`, {});
    await eventually(async () => (await local(act, "status")).state === "reapproval_required");
    await mutate(room.id, async draft => { draft.revision++; });
    assert.ok((await local(act, "observation")).error);
    assert.ok(!(await local(act, "events")).events.some((event: any) => event.type === "observation"), "revocation purges cached private state");
    assert.equal(socketCommands, 1, "no command replay after revocation");

    // A fresh grant exercises the assistant's own disconnect -> bearer revoke,
    // independently of browser-initiated owner revocation.
    const approval = await local(act, "connect", { url: `${authority}/player/?room=${room.shortCode}`, permission: "act", clientLabel: "Disconnect integration" });
    await browserRequest("/device/approve", { code: approval.comparisonCode });
    await eventually(async () => (await local(act, "status")).state === "connected");
    const disconnect = await local(act, "disconnect");
    assert.equal(disconnect.remoteRevocation, "confirmed");
    assert.equal((await browserRequest("/device/grants")).grants.some((grant: any) => grant.clientLabel === "Disconnect integration"), false);
    assert.equal((await local(act, "status")).state, "reapproval_required");
    const pending = await local(act, "connect", { url: `${authority}/player/?room=${room.shortCode}`, permission: "read", clientLabel: "Cancellation integration" });
    assert.equal((await local(act, "disconnect")).approvalCancellation, "confirmed");
    const cancelledApproval = await fetch(`${loopback}/api/device/approve`, {
      method: "POST", headers: { authorization: `Bearer ${browser}`, "content-type": "application/json" },
      body: JSON.stringify({ code: pending.comparisonCode }),
    });
    assert.equal(cancelledApproval.status, 400, "bridge disconnect cancels a pending request on the real authority");
    // Human browser authentication remains independently usable.
    assert.equal((await browserRequest("/auth/user")).user.id, owner.id);
  } finally {
    read.close(); act.close();
    await disposeSockets();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
