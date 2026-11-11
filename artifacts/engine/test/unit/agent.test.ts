/**
 * Pure rules of the agent interface, no backend: principal resolution (credentialProblem), OAuth client and
 * redirect rules, the CIMD URL guard, scopes, the MCP Origin check, credential parsing and result bounding.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { credentialKind, credentialProblem } from "../../convex/auth/principal.ts";
import {
  CLAUDE_CALLBACKS, bearerFrom, grantHint, resourceAllowed, cimdUrlProblem, isAllowedOrigin, parseScope, pollDelay, redirectAllowedForRegistration, redirectMatches,
} from "../../convex/agent/rules.ts";
import { bound } from "../../convex/agent/bound.ts";

const NOW = 1_000_000_000_000;
const row = (over: Record<string, unknown> = {}) =>
  ({ subject: "alice", roomId: "room1", permission: "act" as const, expiresAt: NOW + 1000, ...over });

test("credentialProblem: an account grant has no room to lose; one naming a room is malformed", () => {
  const live = { subject: "u", permission: "account" as const, expiresAt: 2_000 };
  assert.equal(credentialProblem(live, null, 1_000), null);
  assert.equal(credentialProblem({ ...live, revokedAt: 500 }, null, 1_000), "revoked");
  assert.equal(credentialProblem(live, null, 3_000), "expired");
  assert.equal(credentialProblem({ ...live, roomId: "r" }, null, 1_000), "room_gone");
});

test("credentialProblem: a live grant passes; revoked, expired, missing room and lost ownership fail", () => {
  assert.equal(credentialProblem(row(), { ownerId: "bob" }, NOW), null, "act grants do not need ownership");
  assert.equal(credentialProblem(row({ revokedAt: NOW - 1 }), { ownerId: "bob" }, NOW), "revoked");
  assert.equal(credentialProblem(row({ expiresAt: NOW }), { ownerId: "bob" }, NOW), "expired", "expiry is exclusive");
  assert.equal(credentialProblem(row(), null, NOW), "room_gone");
  assert.equal(credentialProblem(row({ permission: "owner" }), { ownerId: "alice" }, NOW), null);
  assert.equal(credentialProblem(row({ permission: "owner" }), { ownerId: "bob" }, NOW), "not_owner", "an owner grant dies with ownership");
  assert.equal(credentialProblem(row({ kind: "oauth", refreshExpiresAt: NOW - 1 }), { ownerId: "bob" }, NOW), "expired", "an idle OAuth grant expires");
});

test("credentialKind: rows written before kinds existed are device credentials", () => {
  assert.equal(credentialKind({}), "device");
  assert.equal(credentialKind({ kind: "oauth" }), "oauth");
  assert.equal(credentialKind({ kind: "assistant" }), "assistant");
});

test("redirect URIs: Claude's callbacks, loopback http (any port) and any https URI register; nothing else does", () => {
  for (const uri of [...CLAUDE_CALLBACKS, "http://127.0.0.1:33418/callback", "http://localhost:9/cb", "http://[::1]:8080/x",
    "https://xyz.replit.dev/", "https://xyz.replit.dev/client/", "https://user-name.github.io/code-gods/?x=1", "https://agent.example/cb"]) {
    assert.equal(redirectAllowedForRegistration(uri, []), true, uri);
  }
  for (const uri of ["http://claude.ai/api/mcp/auth_callback", "http://xyz.replit.dev/", "http://127.0.0.1.evil.example/cb", "javascript:alert(1)",
    "https://claude.ai/api/mcp/auth_callback#frag", "https://xyz.replit.dev/#", "https://user:pw@xyz.replit.dev/", "data:text/html,x", "not a url"]) {
    assert.equal(redirectAllowedForRegistration(uri, []), false, uri);
  }
  assert.equal(redirectAllowedForRegistration("custom.app://cb", ["custom.app://cb"]), true, "operator allowlist (another scheme)");
  assert.equal(redirectAllowedForRegistration(`https://x.example/${"a".repeat(600)}`, []), false, "bounded");
});

test("resource: the site, its MCP endpoint, or none; never another resource", () => {
  const site = "https://dep.convex.site";
  for (const r of [undefined, null, site, `${site}/`, `${site}/mcp`]) assert.equal(resourceAllowed(r, site), true, String(r));
  for (const r of ["", "https://other.convex.site/mcp", `${site}/api`, `${site}/mcp/`, "http://dep.convex.site/mcp"]) assert.equal(resourceAllowed(r, site), false, r);
  const custom = ["https://play.example", site];
  for (const r of ["https://play.example", `${site}/mcp`, "https://play.example/mcp"]) assert.equal(resourceAllowed(r, custom), true, `custom domain: ${r}`);
  assert.equal(resourceAllowed("https://other.example", custom), false);
});

test("redirect matching: exact, except that a loopback port may vary (RFC 8252)", () => {
  assert.equal(redirectMatches("https://claude.ai/api/mcp/auth_callback", ["https://claude.ai/api/mcp/auth_callback"]), true);
  assert.equal(redirectMatches("https://claude.ai/api/mcp/auth_callback?x=1", ["https://claude.ai/api/mcp/auth_callback"]), false);
  assert.equal(redirectMatches("http://127.0.0.1:5555/callback", ["http://127.0.0.1:1234/callback"]), true);
  assert.equal(redirectMatches("http://127.0.0.1:5555/other", ["http://127.0.0.1:1234/callback"]), false);
  assert.equal(redirectMatches("http://localhost:5555/callback", ["http://127.0.0.1:1234/callback"]), false, "host must match");
});

test("CIMD client_id URLs: https with a path, no private or loopback hosts, no credentials or fragments", () => {
  assert.equal(cimdUrlProblem("https://claude.ai/oauth/claude-code-client-metadata"), null);
  for (const url of ["http://claude.ai/meta", "https://claude.ai", "https://claude.ai/", "https://127.0.0.1/meta", "https://localhost/meta",
    "https://10.0.0.1/meta", "https://192.168.1.4/meta", "https://169.254.169.254/latest", "https://[::1]/meta", "https://user:pw@claude.ai/meta",
    "https://claude.ai/meta#x", "https://metadata.google.internal/x", "https://172.16.5.4/m", "https://0.0.0.0/m", "https://[fd00::1]/m"]) {
    assert.notEqual(cimdUrlProblem(url), null, url);
  }
});

test("scopes: read, act and owner (default act); unknown scopes are refused", () => {
  assert.equal(parseScope(undefined), "act");
  assert.equal(parseScope(""), "act");
  assert.equal(parseScope("read"), "read");
  assert.equal(parseScope("act read"), "act", "the strongest requested scope");
  assert.equal(parseScope("owner"), "owner");
  assert.equal(parseScope("admin"), null);
  // An account grant (docs/external-clients.md): alone, never mixed with a room permission.
  assert.equal(parseScope("account"), "account");
  assert.equal(parseScope("account act"), null);
});

test("Origin: absent passes; the site and configured origins pass; anything else is refused", () => {
  assert.equal(isAllowedOrigin(null, "https://dep.convex.site", []), true);
  assert.equal(isAllowedOrigin("https://dep.convex.site", "https://dep.convex.site", []), true);
  assert.equal(isAllowedOrigin("https://claude.ai", "https://dep.convex.site", []), true);
  assert.equal(isAllowedOrigin("https://evil.example", "https://dep.convex.site", []), false);
  assert.equal(isAllowedOrigin("https://app.example", "https://dep.convex.site", ["https://app.example"]), true);
  assert.equal(isAllowedOrigin("null", "https://dep.convex.site", []), false);
});

test("bearerFrom: Authorization Bearer (JWT or cgc_) or x-api-key; malformed values are ignored", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.deepEqual(bearerFrom(h({ authorization: "Bearer cgc_" + "a".repeat(43) })), { kind: "credential", value: "cgc_" + "a".repeat(43) });
  assert.deepEqual(bearerFrom(h({ "x-api-key": "cgc_" + "b".repeat(43) })), { kind: "credential", value: "cgc_" + "b".repeat(43) });
  assert.deepEqual(bearerFrom(h({ authorization: "Bearer eyJa.eyJb.sig" })), { kind: "jwt", value: "eyJa.eyJb.sig" });
  assert.equal(bearerFrom(h({})), null);
  assert.equal(bearerFrom(h({ authorization: "Basic abc" })), null);
  assert.equal(bearerFrom(h({ "x-api-key": "sk-other" })), null);
});

test("bound: small results pass through; oversized arrays are trimmed and marked truncated", () => {
  assert.deepEqual(bound({ a: [1, 2, 3] }, 1000), { value: { a: [1, 2, 3] }, truncated: false });
  const big = { items: Array.from({ length: 1000 }, (_, i) => ({ i, text: "x".repeat(100) })), keep: "yes" };
  const out = bound(big, 20_000);
  assert.equal(out.truncated, true);
  assert.ok(JSON.stringify(out.value).length <= 20_000);
  assert.equal((out.value as typeof big).keep, "yes");
  assert.ok((out.value as typeof big).items.length > 10 && (out.value as typeof big).items[0].i === 0, "keeps the head of the list");
});

test("receipt polling backs off: 250 ms doubling to a 2 s ceiling", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(pollDelay), [250, 500, 1000, 2000, 2000, 2000]);
});

test("grantHint: a tool beyond the connection's grant says which permission it needs, not that it does not exist", () => {
  const needs = (name: string) => ({ send_chat: "act", end_game: "owner", whoami: "read" } as Record<string, "read" | "act" | "owner">)[name];
  assert.match(grantHint("Tool send_chat not found", "read", needs) ?? "", /send_chat needs the act permission; this connection has read/);
  assert.match(grantHint("Tool end_game not found", "act", needs) ?? "", /needs the owner permission/);
  assert.equal(grantHint("Tool frobnicate not found", "read", needs), null, "a truly unknown tool keeps the SDK's message");
  assert.equal(grantHint("Tool whoami not found", "read", needs), null, "a tool the grant covers is not rewritten");
  assert.equal(grantHint("Invalid params", "read", needs), null);
});
