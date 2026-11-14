/** `pnpm player` against a deployment: the device flow, the saved credential, generated commands over /mcp, revocation. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRemoteCli, type RemoteEnv } from "../src/remote.ts";

const SITE = "https://cg.test";

/** A stand-in deployment: device routes and /mcp, recording what it was sent. */
function server() {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  let polls = 0, challenge = "", revoked = false;
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchStub = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    calls.push({ url, headers: init.headers as Record<string, string>, body });
    if (url.endsWith("/api/device/request")) {
      challenge = body.challenge;
      return reply(200, { deviceId: "d1", deviceSecret: "cgd_x", userCode: "ABCD-EFGH", verificationUrl: `${SITE}/device?code=ABCD-EFGH`, roomCode: "LINES", expiresIn: 600, interval: 5 });
    }
    if (url.endsWith("/api/device/poll")) {
      assert.equal(createHash("sha256").update(body.verifier).digest("base64url"), challenge, "PKCE: the verifier matches the challenge sent");
      return ++polls < 2 ? reply(202, { status: "pending" }) : reply(200, { status: "approved", credential: "cgc_secret", credentialId: "c1", roomId: "r1", permission: "act" });
    }
    if (url.endsWith("/api/device/revoke")) { revoked = true; return reply(200, { status: "revoked" }); }
    if (url.endsWith("/mcp")) {
      if (revoked) return reply(401, { error: "invalid_token" });
      assert.equal((init.headers as Record<string, string>).authorization, "Bearer cgc_secret");
      if (body.method === "tools/list") return reply(200, { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "chat_send", title: "Send a chat message" }, { name: "game_get", title: "Show the game" }] } });
      if (body.params.name === "game_end") return reply(200, { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "Only the room owner can do this." }] } });
      return reply(200, { jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: { untrusted: true, notice: "…", data: { ok: true } } } });
    }
    return reply(404, {});
  }) as unknown as typeof fetch;
  return { calls, fetch: fetchStub };
}

function env(fetchStub: typeof fetch) {
  const out: string[] = [], err: string[] = [];
  const configPath = join(mkdtempSync(join(tmpdir(), "cg-cli-")), "cli.json");
  const e: RemoteEnv = { io: { out: l => out.push(l), err: l => err.push(l) }, fetch: fetchStub, configPath, defaultSite: SITE, sleep: async () => {} };
  return { e, out, err, configPath };
}

test("connect runs the device flow and saves the credential privately; commands go to /mcp as tools", async () => {
  const s = server(), { e, out, err, configPath } = env(s.fetch);
  assert.equal(await runRemoteCli(["status"], e), 2);
  assert.match(err.pop()!, /Not connected to https:\/\/cg\.test/);

  assert.equal(await runRemoteCli(["connect", "--room", "LINES"], e), 0);
  assert.match(out[0]!, /Open https:\/\/cg\.test\/device\?code=ABCD-EFGH and approve code ABCD-EFGH \(room LINES, act\)/);
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8"))[SITE], { credential: "cgc_secret", credentialId: "c1", roomId: "r1", roomCode: "LINES", permission: "act" });
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.deepEqual(s.calls[0]!.body.room, "LINES");

  assert.equal(await runRemoteCli(["status"], e), 0);
  assert.equal(out.pop(), "Connected to https://cg.test, room LINES, act rights: 2 tools offered now.");

  assert.equal(await runRemoteCli(["chat", "send", "--text", "hello"], e), 0);
  const call = s.calls.at(-1)!;
  assert.deepEqual([call.body.method, call.body.params.name, call.body.params.arguments], ["tools/call", "chat_send", { text: "hello" }]);
  assert.equal(call.headers["mcp-name"], "chat_send");
  assert.deepEqual(JSON.parse(out.pop()!), { ok: true });

  assert.equal(await runRemoteCli(["game", "end"], e), 1);
  assert.equal(err.pop(), "Only the room owner can do this.");
  assert.equal(await runRemoteCli(["chat", "send"], e), 2, "validated locally by the affordance's schema before sending");
});

test("disconnect revokes and forgets; a revoked credential is told to reconnect", async () => {
  const s = server(), { e, out, err, configPath } = env(s.fetch);
  await runRemoteCli(["connect", "--room", "LINES"], e);
  const copy = readFileSync(configPath, "utf8");
  assert.equal(await runRemoteCli(["disconnect"], e), 0);
  assert.equal(out.pop(), "Disconnected from https://cg.test.");
  assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), {});
  // Another copy of the same credential (another machine) now gets 401.
  const other = env(s.fetch);
  (await import("node:fs")).writeFileSync(other.configPath, copy);
  assert.equal(await runRemoteCli(["status"], other.e), 1);
  assert.match(other.err.pop()!, /revoked or has expired\. Run `pnpm player connect --room CODE` again/);
  assert.equal(err.length, 0);
});

test("--site selects the deployment; help lists the generated commands and the connection commands", async () => {
  const s = server(), { e, out, err } = env(s.fetch);
  assert.equal(await runRemoteCli(["--site", "http://other.test/", "status"], e), 2);
  assert.match(err.pop()!, /Not connected to http:\/\/other\.test\./);
  assert.equal(await runRemoteCli(["help"], e), 0);
  assert.ok(out.some(l => l.startsWith("agent summon --language")) && out.some(l => l.startsWith("connect --room CODE")));
});
