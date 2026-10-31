/**
 * The MCP OAuth 2.1 authorization server on this deployment (docs/surface-architecture.md §4; our own small
 * endpoints, not an auth library's MCP plugin). Public clients only, PKCE S256 only.
 *
 *   GET  /.well-known/oauth-protected-resource[/mcp]  RFC 9728: the resource <site>/mcp and its authorization server
 *   GET  /.well-known/oauth-authorization-server      RFC 8414 metadata
 *   POST /api/oauth/register                          RFC 7591 dynamic client registration (public clients)
 *        (client ID metadata documents: an https client_id is fetched and cached instead)
 *   GET  /oauth/authorize                             validates, stores the request, sends the browser to /connect
 *   GET  /oauth/authorize/complete?request=…          after the human decided on /connect: code (or access_denied)
 *   POST /api/oauth/token                             authorization_code (+ code_verifier) and refresh_token grants
 *   POST /api/oauth/revoke                            RFC 7009
 *
 * One connection is one `kind: "oauth"` credential for one room and one permission. Access tokens are 60-minute
 * player JWTs naming the credential (`cred`), so every call re-checks revocation; refresh tokens rotate, a
 * reused one revokes the credential, and the grant expires after 30 days without a refresh.
 */
import type { HttpRouter } from "convex/server";
import { jwtVerify, createLocalJWKSet } from "jose";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { JWT_AUDIENCE, jwtIssuer, siteUrl } from "../auth/config";
import { pkceChallenge, randomToken, sha256Hex } from "../auth/crypto";
import { jwks, mintJwt } from "../auth/jwt";
import { resourceUrl } from "./mcp";
import { CIMD_CACHE_MS } from "./oauthStore";
import { cimdUrlProblem, envList, parseScope, redirectAllowedForRegistration, redirectMatches } from "./rules";

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
const MAX_BODY_BYTES = 16 * 1024;
const CIMD_MAX_BYTES = 32 * 1024;
const CIMD_TIMEOUT_MS = 5000;
const SCOPES = ["read", "act", "owner"];

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...cors, ...headers } });
const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);
/** An error shown to the human instead of redirecting (unknown client or redirect URI: never redirect there). */
const page = (message: string, status = 400) => new Response(`Code Gods could not start this connection: ${message}`, {
  status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});
const redirect = (location: string) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
function back(redirectUri: string, params: Record<string, string | null | undefined>) {
  const url = new URL(redirectUri);
  for (const [k, value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(k, value);
  return redirect(url.toString());
}
const extraRedirects = () => envList(process.env.CODE_GODS_OAUTH_REDIRECT_URIS);
const bounded = (value: unknown, min: number, max: number): value is string => typeof value === "string" && value.length >= min && value.length <= max;
const printable = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);

function guarded(handler: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    try { return await handler(ctx, request); } catch (error) {
      console.error("oauth route failed", new URL(request.url).pathname, error instanceof Error ? error.message : "unknown");
      return json({ error: "server_error" }, 500);
    }
  });
}
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try { const value = JSON.parse(text || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

export const protectedResourceMetadata = () => ({
  resource: resourceUrl(), authorization_servers: [siteUrl()], bearer_methods_supported: ["header"], scopes_supported: SCOPES,
  resource_name: "Code Gods", resource_documentation: `${siteUrl()}/`,
});
export const authorizationServerMetadata = () => {
  const site = siteUrl();
  return {
    issuer: site, authorization_endpoint: `${site}/oauth/authorize`, token_endpoint: `${site}/api/oauth/token`,
    registration_endpoint: `${site}/api/oauth/register`, revocation_endpoint: `${site}/api/oauth/revoke`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"], scopes_supported: SCOPES,
    client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
  };
};
const metadata = (body: () => unknown) => guarded(async () => json(body(), 200, { "Cache-Control": "public, max-age=300" }));

// ---------------------------------------------------------------------------------------------
// Clients: DCR and client ID metadata documents
// ---------------------------------------------------------------------------------------------

const register = guarded(async (ctx, request) => {
  const body = await readBody(request);
  if (!body) return oauthError("invalid_client_metadata", "JSON body required (max 16 KiB)");
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(u => typeof u === "string")) {
    return oauthError("invalid_redirect_uri", "redirect_uris: 1-10 URIs required");
  }
  if (!uris.every(u => redirectAllowedForRegistration(u, extraRedirects()))) {
    return oauthError("invalid_redirect_uri", "Only Claude's connector callback and loopback (http://127.0.0.1:<port>/…, http://localhost:<port>/…) redirect URIs are accepted");
  }
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method none) are supported");
  const name = typeof body.client_name === "string" && body.client_name.trim() && printable(body.client_name) ? body.client_name.trim().slice(0, 120) : "Unnamed MCP client";
  const clientId = randomToken("cgo_", 24);
  await ctx.runMutation(internal.agent.oauthStore.registerClient, { clientId, clientName: name, redirectUris: uris });
  return json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris,
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: SCOPES.join(" "),
  }, 201);
});

/**
 * Fetch a client ID metadata document. SSRF guard: https on the default port, never a literal private,
 * loopback or link-local address or an internal name (cimdUrlProblem), no redirects, a 5 s timeout and a
 * 32 KiB cap. Hostnames are resolved by the platform's fetch, which this code cannot pin.
 */
async function fetchCimd(clientId: string): Promise<{ clientName: string; redirectUris: string[] } | string> {
  const problem = cimdUrlProblem(clientId);
  if (problem) return problem;
  let response: Response;
  try {
    response = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(CIMD_TIMEOUT_MS), headers: { accept: "application/json" } });
  } catch { return "client metadata could not be fetched"; }
  if (!response.ok) return `client metadata: HTTP ${response.status}`;
  if (Number(response.headers.get("content-length") ?? 0) > CIMD_MAX_BYTES) return "client metadata too large";
  const text = await response.text();
  if (text.length > CIMD_MAX_BYTES) return "client metadata too large";
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(text); } catch { return "client metadata is not JSON"; }
  if (!doc || typeof doc !== "object" || doc.client_id !== clientId) return "client metadata must name the same client_id";
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(u => typeof u === "string" && redirectAllowedForRegistration(u, extraRedirects()))) {
    return "client metadata redirect_uris are not acceptable";
  }
  if ((doc.token_endpoint_auth_method ?? "none") !== "none") return "only public clients are supported";
  const name = typeof doc.client_name === "string" && doc.client_name.trim() && printable(doc.client_name) ? doc.client_name.trim().slice(0, 120) : new URL(clientId).hostname;
  return { clientName: name, redirectUris: uris as string[] };
}

async function clientFor(ctx: ActionCtx, clientId: string): Promise<{ clientName: string; redirectUris: string[] } | string> {
  if (!bounded(clientId, 1, 512)) return "client_id required";
  const cached = await ctx.runQuery(internal.agent.oauthStore.getClient, { clientId });
  if (cached && (cached.kind === "dcr" || Date.now() - (cached.fetchedAt ?? 0) < CIMD_CACHE_MS)) return cached;
  if (!clientId.startsWith("https://")) return "unknown client_id";
  const fetched = await fetchCimd(clientId);
  if (typeof fetched === "string") return fetched;
  await ctx.runMutation(internal.agent.oauthStore.putCimd, { clientId, ...fetched });
  return fetched;
}

// ---------------------------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------------------------

const authorize = guarded(async (ctx, request) => {
  const q = new URL(request.url).searchParams;
  const clientId = q.get("client_id") ?? "", redirectUri = q.get("redirect_uri") ?? "";
  const client = await clientFor(ctx, clientId);
  if (typeof client === "string") return page(client);
  if (!redirectUri || !redirectMatches(redirectUri, client.redirectUris)) return page("redirect_uri is not registered for this client");
  // From here on, errors go back to the client.
  const state = q.get("state");
  if (state !== null && !bounded(state, 1, 512)) return page("state too long");
  const error = (code: string, description: string) => back(redirectUri, { error: code, error_description: description, state, iss: siteUrl() });
  if (q.get("response_type") !== "code") return error("unsupported_response_type", "response_type must be code");
  const challenge = q.get("code_challenge") ?? "";
  if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return error("invalid_request", "PKCE with code_challenge_method S256 is required");
  if (q.get("resource") !== resourceUrl()) return error("invalid_target", `resource must be ${resourceUrl()}`);
  const permission = parseScope(q.get("scope"));
  if (!permission) return error("invalid_scope", "scope is read, act or owner");
  const key = randomToken("", 32);
  await ctx.runMutation(internal.agent.oauthStore.createRequest, {
    keyHash: await sha256Hex(key), clientId, clientName: client.clientName, redirectUri, ...(state !== null ? { state } : {}),
    codeChallenge: challenge, permission, resource: resourceUrl(),
  });
  return redirect(`${siteUrl()}/connect?request=${encodeURIComponent(key)}`);
});

const complete = guarded(async (ctx, request) => {
  const key = new URL(request.url).searchParams.get("request") ?? "";
  if (!bounded(key, 20, 128)) return page("missing request");
  const code = randomToken("", 32);
  const issued = await ctx.runMutation(internal.agent.oauthStore.issueCode, { keyHash: await sha256Hex(key), codeHash: await sha256Hex(code) });
  if (!issued) return page("this connection request is invalid, expired or already completed. Start again from your client.");
  if (issued.outcome === "pending") return redirect(`${siteUrl()}/connect?request=${encodeURIComponent(key)}`);
  if (issued.outcome === "denied") return back(issued.redirectUri, { error: "access_denied", error_description: "The human denied the request", state: issued.state, iss: siteUrl() });
  return back(issued.redirectUri, { code, state: issued.state, iss: siteUrl() });
});

// ---------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------

async function tokens(grant: { credentialId: string; subject: string; roomId: string; permission: string }, refreshToken: string) {
  const { token } = await mintJwt({ subject: grant.subject, scope: "player", credentialId: grant.credentialId, roomId: grant.roomId, permission: grant.permission },
    ACCESS_TOKEN_TTL_SECONDS);
  return json({ access_token: token, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, scope: grant.permission });
}

const token = guarded(async (ctx, request) => {
  const body = await readBody(request);
  if (!body) return oauthError("invalid_request", "form body required (max 16 KiB)");
  const clientId = body.client_id;
  if (!bounded(clientId, 1, 512)) return oauthError("invalid_client", "client_id required", 401);
  if (body.resource !== undefined && body.resource !== resourceUrl()) return oauthError("invalid_target", `resource must be ${resourceUrl()}`);
  const refreshToken = randomToken("cgr_");
  if (body.grant_type === "authorization_code") {
    if (!bounded(body.code, 20, 256) || !bounded(body.code_verifier, 43, 128) || !/^[A-Za-z0-9._~-]+$/.test(body.code_verifier)) {
      return oauthError("invalid_request", "code and code_verifier (43-128 characters) required");
    }
    const redeemed = await ctx.runMutation(internal.agent.oauthStore.redeemCode, {
      codeHash: await sha256Hex(body.code), clientId, ...(typeof body.redirect_uri === "string" ? { redirectUri: body.redirect_uri } : {}),
      challenge: await pkceChallenge(body.code_verifier), tokenHash: await sha256Hex(randomToken("cgc_")), refreshHash: await sha256Hex(refreshToken),
    });
    if ("error" in redeemed) return oauthError("invalid_grant", "The code is invalid, expired, already used, or does not match this client, redirect_uri or verifier");
    return tokens(redeemed, refreshToken);
  }
  if (body.grant_type === "refresh_token") {
    if (!bounded(body.refresh_token, 20, 256)) return oauthError("invalid_request", "refresh_token required");
    const rotated = await ctx.runMutation(internal.agent.oauthStore.refresh, {
      refreshHash: await sha256Hex(body.refresh_token), newRefreshHash: await sha256Hex(refreshToken), clientId,
    });
    if ("error" in rotated) return oauthError("invalid_grant", "The refresh token is invalid, expired, revoked or was already used (reuse revokes the connection)");
    return tokens(rotated, refreshToken);
  }
  return oauthError("unsupported_grant_type", "grant_type is authorization_code or refresh_token");
});

const revoke = guarded(async (ctx, request) => {
  const body = await readBody(request);
  if (!body || !bounded(body.token, 1, 4096)) return oauthError("invalid_request", "token required");
  const clientId = typeof body.client_id === "string" ? body.client_id : undefined;
  if (body.token.startsWith("cgr_")) {
    await ctx.runMutation(internal.agent.oauthStore.revokeToken, { refreshHash: await sha256Hex(body.token), clientId });
  } else {
    try {
      const { payload } = await jwtVerify(body.token, createLocalJWKSet(await jwks()), { issuer: jwtIssuer(), audience: JWT_AUDIENCE, algorithms: ["RS256"] });
      if (typeof payload.cred === "string") await ctx.runMutation(internal.agent.oauthStore.revokeToken, { credentialId: payload.cred, clientId });
    } catch { /* RFC 7009: an invalid token is not an error */ }
  }
  return json({}, 200);
});

const preflight = httpAction(async () => new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "600" } }));

export function registerOAuthRoutes(http: HttpRouter) {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    http.route({ path, method: "GET", handler: metadata(protectedResourceMetadata) });
    http.route({ path, method: "OPTIONS", handler: preflight });
  }
  http.route({ path: "/.well-known/oauth-authorization-server", method: "GET", handler: metadata(authorizationServerMetadata) });
  http.route({ path: "/.well-known/oauth-authorization-server", method: "OPTIONS", handler: preflight });
  http.route({ path: "/oauth/authorize", method: "GET", handler: authorize });
  http.route({ path: "/oauth/authorize/complete", method: "GET", handler: complete });
  for (const [path, handler] of [["/api/oauth/register", register], ["/api/oauth/token", token], ["/api/oauth/revoke", revoke]] as const) {
    http.route({ path, method: "POST", handler });
    http.route({ path, method: "OPTIONS", handler: preflight });
  }
}
