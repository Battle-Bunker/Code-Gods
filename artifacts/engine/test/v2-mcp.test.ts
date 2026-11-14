/**
 * POST /mcp for a credential bound to a v2 room, against the live local backend (`pnpm --filter @workspace/engine dev`):
 * the tool list is the affordance directory's for the credential's server-derived context and grant, and calls run the
 * affordances' internal twins as the delegating human (agent/mcpV2.ts). Nothing hand-written stands between them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mcpTools, type AffordanceContext } from "@workspace/v2-affordances";
import { admin, humans, SITE_ } from "./v2-helpers.ts";

const MCP = `${SITE_}/mcp`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
let nextId = 1;
const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "v2-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };

async function credential(subject: string, roomId: string, permission: "read" | "act" | "owner") {
  const token = `cgc_${randomBytes(32).toString("base64url")}`;
  await admin.mutation("auth/testing:seedCredential", { subject, roomId, permission, tokenHash: sha256(token) });
  return token;
}
async function rpc(token: string, method: string, params: Record<string, unknown> = {}): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`,
    "mcp-protocol-version": "2026-07-28", "mcp-method": method,
  };
  if (method === "tools/call") headers["mcp-name"] = String(params.name);
  const res = await fetch(MCP, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: meta } }) });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  return JSON.parse(text);
}
const names = (body: any): string[] => body.result.tools.map((t: { name: string }) => t.name).sort();

test("a v2 room's credential gets the directory's tools for its context and grant, and acts as its human", async () => {
  const [owner, player] = await humans("Owner", "Player");
  const { roomId } = await admin.mutation("v2/testing:seedGame", { owner: owner!.userId, humans: [player!.userId], practice: 1 });
  const act = await credential(player!.userId, roomId, "act");

  const listed = names(await rpc(act, "tools/list"));
  const context: AffordanceContext = { context: "live", principal: { signedIn: true, member: true, seated: true, owner: false, admin: false }, grant: "act" };
  assert.deepEqual(listed, mcpTools(context).map(t => t.name).sort(), "exactly the directory's tools for a seated player with an act grant");
  assert.ok(listed.includes("agent_summon") && !listed.includes("game_end") && !listed.includes("account_approveConnection"));

  const rule = await rpc(act, "tools/call", { name: "rule_explain", arguments: {} });
  assert.equal(rule.result.isError, false, JSON.stringify(rule));
  assert.equal(rule.result.structuredContent.untrusted, true);
  assert.equal(typeof rule.result.structuredContent.data.family, "string");

  const said = await rpc(act, "tools/call", { name: "chat_send", arguments: { text: "hello from my assistant", requestId: randomUUID() } });
  assert.equal(said.result.isError, false, JSON.stringify(said));
  const pinned = await rpc(act, "tools/call", { name: "view_pinRepresentation", arguments: { rep: "cart" } });
  assert.equal(pinned.result.isError, false, JSON.stringify(pinned));

  const read = await credential(player!.userId, roomId, "read");
  const readList = names(await rpc(read, "tools/list"));
  assert.ok(readList.includes("object_read") && !readList.includes("chat_send") && !readList.includes("view_pinRepresentation"));
  const refused = await rpc(read, "tools/call", { name: "chat_send", arguments: { text: "nope" } });
  assert.equal(refused.error?.code, -32602, JSON.stringify(refused));
  assert.match(refused.error.message, /^Tool chat_send needs the act permission; this connection has read\./, "a read grant cannot write, and is told why");

  const ownerCred = await credential(owner!.userId, roomId, "owner");
  assert.ok(names(await rpc(ownerCred, "tools/list")).includes("game_end"));
});
