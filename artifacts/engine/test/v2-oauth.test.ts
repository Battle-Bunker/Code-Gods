/**
 * An MCP client's OAuth connection to a v2 room, end to end on the live local backend (W3-6): the client registers
 * and asks; the human approves with `account.approveConnection` (the room, the permission lowered never raised,
 * explicit consent to an owner grant, the browser's completion secret); the browser collects the code; the client
 * redeems it and its token reaches the room's directory tools over /mcp as that human.
 *
 * What would break: an approval of a room the human is not in, a raised permission, an owner grant without consent,
 * a code released without the approving browser's secret, a token that does not act in the chosen v2 room.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { humans, perform, SITE_ } from "./v2-helpers.ts";

const REDIRECT = "http://127.0.0.1:9/callback";
const form = (body: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });

async function startOAuth(room: string, scope: string) {
  const registered = await fetch(`${SITE_}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "v2 OAuth test", redirect_uris: [REDIRECT] }) });
  assert.equal(registered.status, 201, await registered.clone().text());
  const { client_id } = await registered.json() as { client_id: string };
  const verifier = randomBytes(32).toString("base64url"), state = randomUUID();
  const authorize = new URL(`${SITE_}/oauth/authorize`);
  for (const [k, v] of Object.entries({ response_type: "code", client_id, redirect_uri: REDIRECT, code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", state, scope, resource: SITE_, room })) authorize.searchParams.set(k, v);
  const toConnect = await fetch(authorize, { redirect: "manual" });
  assert.equal(toConnect.status, 302, await toConnect.clone().text());
  return { clientId: client_id, verifier, state, request: new URL(toConnect.headers.get("location")!).searchParams.get("request")! };
}

async function complete(flow: Awaited<ReturnType<typeof startOAuth>>, completion: string) {
  const res = await fetch(`${SITE_}/oauth/authorize/complete?request=${encodeURIComponent(flow.request)}&completion=${encodeURIComponent(completion)}`, { redirect: "manual" });
  const back = res.headers.get("location") ? new URL(res.headers.get("location")!) : null;
  return back?.searchParams.get("code") ?? null;
}

async function mcp(token: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`,
    "mcp-protocol-version": "2026-07-28", "mcp-method": method, ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}),
  };
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "v2-oauth", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
  const res = await fetch(`${SITE_}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: meta } }) });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  return JSON.parse(text);
}

test("a human approves an MCP client's OAuth request for a v2 room; its token acts there as them", { timeout: 60_000 }, async () => {
  const [ada, bo, stranger] = await humans("OAuth Ada", "OAuth Bo", "OAuth Stranger");
  const created = await perform(ada!, "room.create", { name: "OAuth room" });
  const roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  const flow = await startOAuth(roomId, "owner");
  const completion = randomBytes(32).toString("base64url");
  const approve = (h: typeof ada, args: Record<string, unknown>) => perform(h!, "account.approveConnection", { request: flow.request, completion, ...args });
  const failed = async (p: Promise<any>) => { try { const out = await p; return out.error?.code ?? "ok"; } catch (e) { return (e as any).data?.error?.code ?? "threw"; } };

  // What /connect shows: the client, the grant asked for, the hinted room and the human's v2 rooms to choose from.
  const shown = await ada!.query("v2/connect:pending", { request: flow.request });
  assert.deepEqual([shown.clientName, shown.grant, shown.status, shown.hint?.roomId, shown.hint?.member], ["v2 OAuth test", "owner", "pending", roomId, true], JSON.stringify(shown));
  assert.ok(shown.rooms.some((r: any) => r.roomId === roomId && r.owner));
  assert.equal(await failed(approve(stranger, { grant: "act", room: roomId })), "failed", "not a member of the room");
  assert.equal(await failed(approve(bo, { grant: "owner", room: roomId, ownerConsent: true })), "failed", "an owner grant needs the room's owner");
  assert.equal(await failed(approve(ada, { grant: "owner", room: roomId })), "failed", "an owner grant needs explicit consent");
  assert.equal(await failed(approve(ada, { grant: "account", accountConsent: true })), "failed", "a room request is never an account grant");
  assert.equal(await complete(flow, completion), null, "nothing to collect before approval");

  const lowered = await approve(ada, { grant: "act", room: roomId });
  assert.equal(lowered.ok, true, JSON.stringify(lowered));
  assert.equal(await complete(flow, randomBytes(32).toString("base64url")), null, "the code goes only to the browser that approved");
  const code = await complete(flow, completion);
  assert.ok(code, "the approving browser collects the code");
  const exchanged = await fetch(`${SITE_}/api/oauth/token`, form({ grant_type: "authorization_code", code: code!, code_verifier: flow.verifier, client_id: flow.clientId, redirect_uri: REDIRECT, resource: SITE_ }));
  assert.equal(exchanged.status, 200, await exchanged.clone().text());
  const { access_token } = await exchanged.json() as { access_token: string };

  const tools = (await mcp(access_token, "tools/list")).result.tools.map((t: { name: string }) => t.name);
  assert.ok(tools.includes("chat_send") && !tools.includes("room_settings"), "act, lowered from owner: the room's player tools, no owner tools");
  const said = await mcp(access_token, "tools/call", { name: "chat_send", arguments: { text: "hello over OAuth", requestId: randomUUID() } });
  assert.equal(said.result.isError, false, JSON.stringify(said));
  const chat = await ada!.query("v2/rooms:chat", { roomId, paginationOpts: { numItems: 5, cursor: null } });
  assert.equal(chat.page[0].from, "OAuth Ada", "it speaks as the human who approved");
  assert.equal(chat.page[0].text, "hello over OAuth");
});

test("an account request is approved as asked, with explicit consent, or not at all", { timeout: 60_000 }, async () => {
  const [cy] = await humans("OAuth Cy");
  const roomId = (await perform(cy!, "room.create", { name: "Cy's room" })).result.roomId;
  const flow = await startOAuth(roomId, "account");
  const completion = randomBytes(32).toString("base64url");
  const approve = (args: Record<string, unknown>) => perform(cy!, "account.approveConnection", { request: flow.request, completion, ...args }).catch((e: unknown) => (e as { data?: unknown }).data as any);
  assert.match((await approve({ grant: "act", room: roomId })).error.message, /every room/, "never turned into a room grant");
  assert.match((await approve({ grant: "account" })).error.message, /explicit consent/);
  assert.equal((await approve({ grant: "account", accountConsent: true })).ok, true);
  assert.ok(await complete(flow, completion), "the approving browser collects the code");
});

test("a human denies an OAuth request: nothing to collect, and it cannot be approved after", { timeout: 60_000 }, async () => {
  const [dee] = await humans("OAuth Dee");
  const roomId = (await perform(dee!, "room.create", { name: "Dee's room" })).result.roomId;
  const flow = await startOAuth(roomId, "act");
  assert.equal((await perform(dee!, "account.denyConnection", { request: flow.request })).ok, true);
  assert.equal((await dee!.query("v2/connect:pending", { request: flow.request })).status, "denied");
  const completion = randomBytes(32).toString("base64url");
  const late = await perform(dee!, "account.approveConnection", { request: flow.request, grant: "act", room: roomId, completion }).catch((e: any) => e.data);
  assert.equal(late.error.code, "failed", "a denied request stays denied");
  assert.equal(await complete(flow, completion), null);
});

test("a refresh token sent again moments after its rotation (a reload cut the answer off) rotates again; an old one still revokes", { timeout: 90_000 }, async () => {
  // Catches (Parity C, account mode): a page unloading while its refresh was in flight kept the rotated-out token, and its
  // next use revoked the grant: signed out for good.
  const [ada] = await humans("Refresh Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Refresh room" })).result;
  const flow = await startOAuth(roomId, "act");
  const completion = randomBytes(32).toString("base64url");
  assert.equal((await perform(ada!, "account.approveConnection", { request: flow.request, completion, grant: "act", room: roomId })).ok, true);
  const code = await complete(flow, completion);
  const first = await (await fetch(`${SITE_}/api/oauth/token`, form({ grant_type: "authorization_code", code: code!, code_verifier: flow.verifier, client_id: flow.clientId, redirect_uri: REDIRECT, resource: SITE_ }))).json() as { refresh_token: string };
  const refresh = (token: string) => fetch(`${SITE_}/api/oauth/token`, form({ grant_type: "refresh_token", refresh_token: token, client_id: flow.clientId, resource: SITE_ }));
  const r1 = first.refresh_token;
  assert.equal((await refresh(r1)).status, 200, "rotated; its answer is lost");
  const again = await refresh(r1);
  assert.equal(again.status, 200, `the same token moments later rotates again: ${await again.clone().text()}`);
  const { refresh_token: r3, access_token } = await again.json() as { refresh_token: string; access_token: string };
  assert.equal((await mcp(access_token, "tools/list")).result.tools.length > 0, true, "the connection still acts");
  const later = await refresh(r3);
  assert.equal(later.status, 200);
  const { refresh_token: r4 } = await later.json() as { refresh_token: string };
  // Past the grace a rotated-out token is a reuse: the connection is revoked.
  await new Promise(r => setTimeout(r, 31_000));
  assert.equal((await refresh(r1)).status, 400, "an old token is refused");
  assert.equal((await refresh(r4)).status, 400, "and its reuse revoked the connection");
});
