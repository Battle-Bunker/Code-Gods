/**
 * HTTP actions under /api/ (registered by convex/http.ts). See registerAuthRoutes for the list.
 * Errors never echo secrets or internal details; every response is `Cache-Control: no-store`
 * except the public JWKS.
 */
import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  DEVICE_POLL_INTERVAL_S, DEVICE_TTL_MS, FLOW_COOKIE, OIDC_FLOW_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS,
  cookieSecure, oidcIssuer, siteOrigin, siteUrl,
} from "./config";
import { formatUserCode, pkceChallenge, randomToken, randomUserCode, sha256Hex } from "./crypto";
import { jwks, mintJwt } from "./jwt";
import { authorizationUrl, redeemCode } from "./oidc";
import { profileName } from "./profileName";

const MAX_BODY_BYTES = 8 * 1024;

// ---------------------------------------------------------------------------------------------
// Small HTTP helpers
// ---------------------------------------------------------------------------------------------
const noStore = { "Cache-Control": "no-store" };
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...noStore, ...headers } });
}
function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...noStore } });
}
function redirect(location: string, cookies: string[] = [], status = 302): Response {
  const headers = new Headers({ Location: location, ...noStore });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status, headers });
}
function cookie(name: string, value: string, maxAgeSeconds: number, path = "/"): string {
  return [`${name}=${value}`, `Path=${path}`, `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Lax", ...(cookieSecure() ? ["Secure"] : [])].join("; ");
}
const clearCookie = (name: string, path = "/") => cookie(name, "", 0, path);
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header || header.length > 8192) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
    }
  }
  return null;
}
/** Exact same-origin check for cookie-authenticated POSTs (CSRF): the Origin header must be the site. */
const sameOrigin = (request: Request) => request.headers.get("origin") === siteOrigin();

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(body || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
const boundedString = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max;

/** Same-origin path only: "/x", never "//x", "/\x" or anything with control characters. */
export function safeReturn(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

/** Wrap a handler so unexpected failures become a generic 500 (details only in the deployment log). */
function guarded(handler: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    try {
      return await handler(ctx, request);
    } catch (error) {
      console.error("auth route failed", request.method, new URL(request.url).pathname, error instanceof Error ? error.message : "unknown");
      return json({ error: "Internal error" }, 500);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Browser login
// ---------------------------------------------------------------------------------------------
/**
 * The OIDC callback URL: this site's /api/callback, unless REPLIT_OIDC_REDIRECT_URI names a relay. Replit
 * only redirects to the client Repl's own domains, so production points it at a page there that forwards
 * `code` and `state` here unchanged (PKCE, state and nonce still bind the code to this browser's flow).
 */
const redirectUri = () => process.env.REPLIT_OIDC_REDIRECT_URI?.trim() || `${siteUrl()}/api/callback`;

const login = guarded(async (ctx, request) => {
  const returnTo = safeReturn(new URL(request.url).searchParams.get("returnTo"));
  const verifier = randomToken(), state = randomToken(), nonce = randomToken(), key = randomToken();
  await ctx.runMutation(internal.auth.sessions.createFlow, { keyHash: await sha256Hex(key), verifier, state, nonce, returnTo });
  const location = await authorizationUrl({ redirectUri: redirectUri(), state, nonce, challenge: await pkceChallenge(verifier) });
  return redirect(location, [cookie(FLOW_COOKIE, key, OIDC_FLOW_TTL_MS / 1000, "/api/")]);
});

const loginFailed = () => new Response("Login failed or expired. Please try again from the start.", {
  status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", ...noStore, "Set-Cookie": clearCookie(FLOW_COOKIE, "/api/") },
});

const callback = guarded(async (ctx, request) => {
  const url = new URL(request.url);
  const key = readCookie(request, FLOW_COOKIE);
  if (!key) return loginFailed();
  // Consume the flow first: whatever happens next, it cannot be replayed.
  const flow = await ctx.runMutation(internal.auth.sessions.consumeFlow, { keyHash: await sha256Hex(key) });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!flow || !boundedString(code, 1, 2048) || !boundedString(state, 1, 256) || state !== flow.state) return loginFailed();
  let claims;
  try {
    claims = await redeemCode({ code, redirectUri: redirectUri(), verifier: flow.verifier, nonce: flow.nonce });
  } catch (error) {
    console.warn("OIDC callback rejected:", error instanceof Error ? error.message : "unknown");
    return loginFailed();
  }
  const sessionToken = randomToken();
  await ctx.runMutation(internal.auth.sessions.completeLogin, {
    subject: claims.sub!, name: profileName(claims as Record<string, unknown>),
    email: typeof claims.email === "string" ? claims.email.slice(0, 320) : undefined,
    emailVerified: claims.email_verified === true, issuer: oidcIssuer(), sessionHash: await sha256Hex(sessionToken),
  });
  return redirect(safeReturn(flow.returnTo), [
    cookie(SESSION_COOKIE, sessionToken, SESSION_TTL_MS / 1000), clearCookie(FLOW_COOKIE, "/api/"),
  ]);
});

async function sessionFor(ctx: ActionCtx, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? await ctx.runQuery(internal.auth.sessions.sessionUser, { tokenHash: await sha256Hex(token) }) : null;
}

/** The Convex React client's fetchAccessToken: session cookie + exact same origin → browser JWT. */
const browserToken = guarded(async (ctx, request) => {
  if (!sameOrigin(request)) return json({ error: "Origin check failed" }, 403);
  const session = await sessionFor(ctx, request);
  if (!session) return json({ token: null }, 401);
  const { token, expiresAt } = await mintJwt({ subject: session.id, scope: "browser", sessionId: session.sessionId });
  return json({ token, expiresAt });
});

const authUser = guarded(async (ctx, request) => {
  const session = await sessionFor(ctx, request);
  return json({ user: session ? { id: session.id, name: session.name, isAdmin: session.isAdmin } : null });
});

const logout = guarded(async (ctx, request) => {
  if (request.method === "POST" && !sameOrigin(request)) return json({ error: "Origin check failed" }, 403);
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await ctx.runMutation(internal.auth.sessions.deleteSession, { tokenHash: await sha256Hex(token) });
  return redirect("/", [clearCookie(SESSION_COOKIE)], request.method === "POST" ? 303 : 302);
});

// ---------------------------------------------------------------------------------------------
// Device approval and credentials
// ---------------------------------------------------------------------------------------------
const PERMISSIONS = ["read", "act", "owner"] as const;
type Permission = typeof PERMISSIONS[number];

const deviceRequest = guarded(async (ctx, request) => {
  const body = await readJson(request);
  if (!body) return json({ error: "JSON body required (max 8 KiB)" }, 400);
  const room = body.room ?? body.roomId;
  const permission = (body.permission ?? "act") as Permission;
  const label = body.label ?? body.clientLabel ?? "Room assistant";
  if (!boundedString(body.challenge, 43, 43) || !/^[A-Za-z0-9_-]{43}$/.test(body.challenge)) return json({ error: "challenge must be an S256 PKCE challenge (43 base64url characters)" }, 400);
  if (!boundedString(room, 1, 64)) return json({ error: "room (id or short code) required" }, 400);
  if (!PERMISSIONS.includes(permission)) return json({ error: "permission must be read, act or owner" }, 400);
  if (!boundedString(label, 1, 120) || !label.trim() || /[\u0000-\u001f\u007f]/.test(label)) return json({ error: "label must be 1-120 printable characters (self-reported)" }, 400);
  const deviceSecret = randomToken("cgd_");
  for (let attempt = 0; attempt < 3; attempt++) {
    const userCode = randomUserCode();
    const result = await ctx.runMutation(internal.auth.device.createRequest, {
      deviceSecretHash: await sha256Hex(deviceSecret), userCodeHash: await sha256Hex(userCode), challenge: body.challenge,
      room, permission, label: label.trim(),
    });
    if ("error" in result) {
      if (result.error === "retry") continue;
      if (result.error === "room_not_found") return json({ error: "Room not found" }, 404);
      return json({ error: "Too many pending approval requests for this room; try again later" }, 429);
    }
    const shown = formatUserCode(userCode);
    return json({
      deviceId: result.deviceId, deviceSecret, userCode: shown,
      verificationUrl: `${siteUrl()}/device?code=${shown}`, verificationUri: `${siteUrl()}/device`,
      roomId: result.roomId, roomCode: result.roomCode, permission, label: label.trim(),
      expiresIn: DEVICE_TTL_MS / 1000, interval: DEVICE_POLL_INTERVAL_S,
    });
  }
  return json({ error: "Please retry" }, 503);
});

const devicePoll = guarded(async (ctx, request) => {
  const body = await readJson(request);
  if (!body || !boundedString(body.deviceId, 1, 64) || !boundedString(body.deviceSecret, 1, 256) || !boundedString(body.verifier, 43, 128)) {
    return json({ status: "invalid", error: "deviceId, deviceSecret and verifier (43-128 characters) required" }, 400);
  }
  const credential = randomToken("cgc_");
  const result = await ctx.runMutation(internal.auth.device.poll, {
    deviceId: body.deviceId, deviceSecretHash: await sha256Hex(body.deviceSecret), challenge: await pkceChallenge(body.verifier),
    credentialHash: await sha256Hex(credential),
  });
  switch (result.status) {
    case "ok": return json({
      status: "approved", credential, credentialId: result.credentialId, roomId: result.roomId, permission: result.permission, expiresAt: result.expiresAt,
    });
    case "pending": return json({ status: "pending", interval: DEVICE_POLL_INTERVAL_S }, 202);
    case "slow_down": return json({ status: "slow_down", interval: DEVICE_POLL_INTERVAL_S }, 429);
    case "denied": return json({ status: "denied" }, 403);
    case "forbidden": return json({ status: "forbidden", error: "The approver is no longer the room owner" }, 403);
    case "expired": return json({ status: "expired" }, 410);
    default: return json({ status: "invalid" }, 400);
  }
});

function credentialFrom(request: Request, body: Record<string, unknown> | null): string | null {
  const auth = request.headers.get("authorization");
  const value = auth?.startsWith("Bearer ") ? auth.slice(7) : body?.credential;
  return boundedString(value, 20, 128) && /^cgc_[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

/** Credential → 10-minute player JWT (`sub`, `scope: "player"`, `cred`, `room`, `perm`). */
const deviceToken = guarded(async (ctx, request) => {
  const credential = credentialFrom(request, await readJson(request));
  if (!credential) return json({ error: "credential required" }, 400);
  const grant = await ctx.runMutation(internal.auth.credentials.exchange, { tokenHash: await sha256Hex(credential) });
  if (!grant) return json({ error: "Credential revoked, expired or unknown; reconnect for a fresh approval" }, 401);
  const { token, expiresAt } = await mintJwt({
    subject: grant.subject, scope: "player", credentialId: grant.credentialId, roomId: grant.roomId, permission: grant.permission,
  });
  return json({ token, expiresAt, roomId: grant.roomId, permission: grant.permission, credentialId: grant.credentialId, credentialExpiresAt: grant.expiresAt });
});

const deviceRevoke = guarded(async (ctx, request) => {
  const credential = credentialFrom(request, await readJson(request));
  if (!credential) return json({ error: "credential required" }, 400);
  const revoked = await ctx.runMutation(internal.auth.credentials.revokeSelf, { tokenHash: await sha256Hex(credential) });
  return revoked ? json({ status: "revoked" }) : json({ error: "Credential revoked, expired or unknown" }, 401);
});

// ---------------------------------------------------------------------------------------------
// Public keys
// ---------------------------------------------------------------------------------------------
const jwksRoute = guarded(async () => json(await jwks(), 200, {
  "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*",
}));

/** Unknown /api/* paths are a JSON 404, never the SPA's index.html. */
const apiNotFound = httpAction(async () => json({ error: "Not found" }, 404));

export function registerAuthRoutes(http: HttpRouter) {
  http.route({ path: "/api/login", method: "GET", handler: login });
  http.route({ path: "/api/callback", method: "GET", handler: callback });
  http.route({ path: "/api/auth/token", method: "POST", handler: browserToken });
  http.route({ path: "/api/auth/user", method: "GET", handler: authUser });
  http.route({ path: "/api/logout", method: "GET", handler: logout });
  http.route({ path: "/api/logout", method: "POST", handler: logout });
  http.route({ path: "/api/device/request", method: "POST", handler: deviceRequest });
  http.route({ path: "/api/device/poll", method: "POST", handler: devicePoll });
  http.route({ path: "/api/device/token", method: "POST", handler: deviceToken });
  http.route({ path: "/api/device/revoke", method: "POST", handler: deviceRevoke });
  http.route({ path: "/api/.well-known/jwks.json", method: "GET", handler: jwksRoute });
  for (const method of ["GET", "POST"] as const) http.route({ pathPrefix: "/api/", method, handler: apiNotFound });
}
