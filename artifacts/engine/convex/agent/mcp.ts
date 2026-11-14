/**
 * POST /mcp: the Code Gods MCP server (docs/surface-architecture.md §4), a stateless Convex HTTP action that
 * answers with JSON only, for both protocol eras:
 *   - 2026-07-28 (no initialize; `server/discover`; per-request `_meta` envelope and the MCP-Protocol-Version,
 *     Mcp-Method and Mcp-Name headers) through @modelcontextprotocol/server v2 `createMcpHandler` (strict
 *     modern leg, `responseMode: "json"`);
 *   - 2025-era clients (`initialize`, `tools/list`, `tools/call`), routed by the SDK's own `isLegacyRequest`
 *     to a stateless `WebStandardStreamableHTTPServerTransport` with JSON responses (the SDK's built-in
 *     legacy fallback would answer with SSE).
 * The SDK runs in Convex's V8 runtime as is; JSON Schema validation uses its bundled cfWorker validator
 * (no `new Function`).
 *
 * Tools: only `whoami` while engine v2's tools are built (the v1 tool registry left with the v1 engine in D2; v2's
 * MCP surface is generated from lib/v2-affordances). Authentication and the OAuth server are unchanged.
 *
 * Authentication: `Authorization: Bearer <player JWT>` (MCP OAuth access tokens; verified with this
 * deployment's own key) or `Bearer cgc_…` / `x-api-key: cgc_…` (device credentials, looked up by hash).
 * Unauthenticated → 401 with `WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource/mcp"`.
 */
import {
  createMcpHandler, fromJsonSchema, isLegacyRequest, McpServer, WebStandardStreamableHTTPServerTransport,
  type CallToolResult, type JsonSchemaType, type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import { jwtVerify, createLocalJWKSet } from "jose";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { PLAYER_JWT_AUDIENCE, playerIssuer, siteOrigin, siteUrl } from "../auth/config";
import { sha256Hex } from "../auth/crypto";
import { jwks } from "../auth/jwt";
import { bearerFrom, envList, isAllowedOrigin } from "./rules";
import type { Who } from "./store";

export const MAX_MCP_BODY_BYTES = 256 * 1024;
const SERVER = { name: "code-gods", title: "Code Gods", version: "0.1.0" };
const INSTRUCTIONS = "Code Gods: you act as the human who connected you, in one room, with their rights (read < act < owner). " +
  "The game tools are being rebuilt; for now only whoami answers.";

const validator = new CfWorkerJsonSchemaValidator();
const WHOAMI_INPUT = { type: "object", properties: {}, additionalProperties: false } as const;
const WHOAMI_OUTPUT = {
  type: "object",
  properties: {
    subject: { type: "string" }, name: { type: "string" }, roomId: { type: "string" }, roomCode: { type: ["string", "null"] },
    permission: { type: "string", enum: ["read", "act", "owner"] }, kind: { type: "string" }, label: { type: "string" }, expiresAt: { type: "number" },
  },
  required: ["subject", "name", "roomId", "roomCode", "permission", "kind", "label", "expiresAt"],
} as const;
let whoamiSchemas: { input: ReturnType<typeof fromJsonSchema>; output: ReturnType<typeof fromJsonSchema> } | undefined;
const schemas = () => whoamiSchemas ??= {
  input: fromJsonSchema(WHOAMI_INPUT as unknown as JsonSchemaType, validator), output: fromJsonSchema(WHOAMI_OUTPUT as unknown as JsonSchemaType, validator),
};

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

/**
 * A fresh MCP server for one request. Its tools are generated from the affordance directory (owner decision 16;
 * W6-2's MCP generator), never registered here by hand: until that lands on v2 rooms, the server lists none.
 */
function serverFor(_who: Who) {
  return new McpServer(SERVER, { capabilities: { tools: {} }, instructions: INSTRUCTIONS, jsonSchemaValidator: validator });
}

/**
 * The modern (2026-07-28) leg: one handler per isolate (it is built for concurrent requests; its factory
 * makes a fresh server per request from the request's principal, passed through `authInfo`).
 */
let modernHandler: McpHttpHandler | undefined;
const modern = () => modernHandler ??= createMcpHandler(({ authInfo }) => {
  const { who } = (authInfo?.extra as { request: { who: Who } }).request;
  return serverFor(who);
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
  try {
    if (await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_MCP_BODY_BYTES })) {
      const server = serverFor(who);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try { return await transport.handleRequest(request); } finally { await server.close(); }
    }
    return await modern().fetch(request, { authInfo: { token: "", clientId: who.credentialId, scopes: [who.permission], extra: { request: { who } } } });
  } catch (error) {
    console.error("mcp failed", error instanceof Error ? error.message : "unknown");
    return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
  }
});

/** GET and DELETE (2025 session operations, SSE streams): this server is stateless and JSON only. */
export const mcpMethodNotAllowed = httpAction(async () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed: POST JSON-RPC to /mcp" } }),
    { status: 405, headers: { Allow: "POST", "Content-Type": "application/json", "Cache-Control": "no-store" } }));
