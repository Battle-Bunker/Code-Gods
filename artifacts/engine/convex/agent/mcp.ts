/**
 * POST /mcp: the Code Gods MCP server (docs/surface-architecture.md §4), a stateless Convex HTTP action that
 * answers with JSON only, for both protocol eras:
 *   - 2026-07-28 (no initialize; `server/discover`; per-request `_meta` envelope and the MCP-Protocol-Version,
 *     Mcp-Method and Mcp-Name headers) through @modelcontextprotocol/server v2 `createMcpHandler` (strict
 *     modern leg, `responseMode: "json"`);
 *   - 2025-era clients (`initialize`, `tools/list`, `tools/call`), routed by the SDK's own `isLegacyRequest`
 *     to a stateless `WebStandardStreamableHTTPServerTransport` with JSON responses (the SDK's built-in
 *     legacy fallback would answer with SSE).
 * The SDK runs in Convex's V8 runtime as is. Every tool is generated from the affordance directory (agent/mcpV2.ts,
 * owner decision 16); none is registered by hand.
 *
 * Authentication: `Authorization: Bearer <player JWT>` (MCP OAuth access tokens; verified with this
 * deployment's own key) or `Bearer cgc_…` / `x-api-key: cgc_…` (device credentials, looked up by hash).
 * Unauthenticated → 401 with `WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`.
 * `tools/list` shows only the tools the grant may use; every call is checked again by its `defineOp`.
 */
import { createMcpHandler, isLegacyRequest, WebStandardStreamableHTTPServerTransport, type McpHttpHandler } from "@modelcontextprotocol/server";
import { jwtVerify, createLocalJWKSet } from "jose";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { PLAYER_JWT_AUDIENCE, playerIssuer, siteOrigin, siteUrl } from "../auth/config";
import { sha256Hex } from "../auth/crypto";
import { jwks } from "../auth/jwt";
import { NEEDS_CONTEXT, serverForV2, v2ContextFor, v2PermissionOf } from "./mcpV2";
import type { AffordanceContext } from "@workspace/v2-affordances";
import { bearerFrom, envList, grantHint, isAllowedOrigin } from "./rules";
import type { Who } from "./store";

export const MAX_MCP_BODY_BYTES = 256 * 1024;
const SERVER = { name: "code-gods", title: "Code Gods", version: "0.1.0" };
export const resourceUrl = () => `${siteUrl()}/mcp`;
export const resourceMetadataUrl = () => `${siteUrl()}/.well-known/oauth-protected-resource/mcp`;

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
function unauthorized(error?: "invalid_token") {
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl()}"${error ? `, error="${error}", error_description="The token is revoked, expired or unknown"` : ""}`;
  return json({ error: error ?? "unauthorized", error_description: "Connect with OAuth or a Code Gods room credential (cgc_…)" }, 401, { "WWW-Authenticate": challenge });
}

/** The request's credential → its principal, or null. */
async function authenticate(ctx: ActionCtx, request: Request): Promise<Who | null | "missing"> {
  const presented = bearerFrom(request.headers);
  // A header that is there but holds no recognisable token is a bad token, not a missing one.
  if (!presented) return request.headers.has("authorization") || request.headers.has("x-api-key") ? null : "missing";
  if (presented.kind === "credential") return ctx.runMutation(internal.agent.store.authenticate, { tokenHash: await sha256Hex(presented.value) });
  try {
    const { payload } = await jwtVerify(presented.value, createLocalJWKSet(await jwks()), { issuer: playerIssuer(), audience: PLAYER_JWT_AUDIENCE, algorithms: ["RS256"] });
    if (payload.scope !== "player" || typeof payload.cred !== "string" || typeof payload.sub !== "string") return null;
    return ctx.runMutation(internal.agent.store.authenticate, { credentialId: payload.cred, subject: payload.sub });
  } catch {
    return null;
  }
}

/** A JSON-RPC "Tool X not found" for a tool beyond the grant → the permission it needs (rules.ts grantHint). */
async function withGrantHint(response: Response, who: Who): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const text = await response.text();
  let body: { error?: { code?: unknown; message?: unknown } } | undefined;
  try { body = JSON.parse(text); } catch { /* not ours to rewrite */ }
  const hint = body?.error?.code === -32602 && typeof body.error.message === "string" ? grantHint(body.error.message, who.permission, v2PermissionOf) : null;
  if (!hint) return new Response(text, { status: response.status, headers: response.headers });
  body!.error!.message = hint;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

/** A fresh MCP server for one request, with the directory's tools this principal's grant may use. */
const serverFor = (ctx: ActionCtx, who: Who, v2: AffordanceContext | null) => serverForV2(ctx, who, v2, SERVER);

/**
 * The modern (2026-07-28) leg: one handler per isolate (it is built for concurrent requests; its factory
 * makes a fresh server per request from the request's principal, passed through `authInfo`).
 */
let modernHandler: McpHttpHandler | undefined;
const modern = () => modernHandler ??= createMcpHandler(({ authInfo }) => {
  const { ctx, who, v2 } = (authInfo?.extra as { request: { ctx: ActionCtx; who: Who; v2: AffordanceContext | null } }).request;
  return serverFor(ctx, who, v2);
}, { responseMode: "json", legacy: "reject", maxRequestBodySize: MAX_MCP_BODY_BYTES });

export const mcp = httpAction(async (ctx, request) => {
  if (!isAllowedOrigin(request.headers.get("origin"), siteOrigin(), envList(process.env.MCP_ALLOWED_ORIGINS))) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Origin not allowed" } }, 403);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_MCP_BODY_BYTES) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large" } }, 413);
  }
  const who = await authenticate(ctx, request);
  if (who === "missing") return unauthorized();
  if (!who) return unauthorized("invalid_token");
  // The principal's context, resolved by the server, decides the generated tool list. Only tools/list and
  // tools/call need it; a context that no longer resolves (the room or user gone) is an invalid token, not a crash.
  let v2: AffordanceContext | null = null;
  if (NEEDS_CONTEXT.has(await methodOf(request))) {
    try { v2 = await v2ContextFor(ctx, who); } catch { return unauthorized("invalid_token"); }
  }
  try {
    if (await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_MCP_BODY_BYTES })) {
      const server = serverFor(ctx, who, v2);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try { return await withGrantHint(await transport.handleRequest(request), who); } finally { await server.close(); }
    }
    return await withGrantHint(await modern().fetch(request, { authInfo: { token: "", clientId: who.credentialId, scopes: [who.permission], extra: { request: { ctx, who, v2 } } } }), who);
  } catch (error) {
    console.error("mcp failed", error instanceof Error ? error.message : "unknown");
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
  }
});

/** The JSON-RPC method of a request (the modern era's Mcp-Method header, else the body's), "" when unreadable. */
async function methodOf(request: Request): Promise<string> {
  const header = request.headers.get("mcp-method");
  if (header) return header;
  try { const body = await request.clone().json() as { method?: unknown }; return typeof body?.method === "string" ? body.method : ""; } catch { return ""; }
}

/** GET and DELETE (2025 session operations, SSE streams): this server is stateless and JSON only. */
export const mcpMethodNotAllowed = httpAction(async () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed: POST JSON-RPC to /mcp" } }),
    { status: 405, headers: { Allow: "POST", "Content-Type": "application/json", "Cache-Control": "no-store" } }));
