/**
 * Our HTTP actions under /api/ (registered by convex/http.ts): device approval, player JWTs and their JWKS.
 * Browser sign-in lives under /api/auth/* (Better Auth, convex/auth/betterAuth.ts). Errors never echo
 * secrets or internal details; every response is `Cache-Control: no-store` except the public JWKS.
 */
import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { bounded as boundedString, guarded as guardedAs, json as jsonResponse, printable, readBody } from "../lib/http";
import { DEVICE_POLL_INTERVAL_S, DEVICE_TTL_MS, siteUrl } from "./config";
import { formatUserCode, pkceChallenge, randomToken, randomUserCode, sha256Hex } from "./crypto";
import { jwks, mintPlayerJwt } from "./jwt";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * The device routes are authorized by secrets in the request (device secret + PKCE verifier, or the credential),
 * never by cookies, so a player app on ANY origin may call them (docs/external-clients.md decision 4): `*`, and
 * never Access-Control-Allow-Credentials.
 */
export const BEARER_CORS = {
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600",
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => jsonResponse(body, status, { ...BEARER_CORS, ...headers });

const readJson = (request: Request) => readBody(request, MAX_BODY_BYTES);
/** Unexpected failures become a generic 500 (details only in the deployment log). */
const guarded = (handler: (ctx: ActionCtx, request: Request) => Promise<Response>) => guardedAs("auth route", () => json({ error: "Internal error" }, 500), handler);
const preflight = httpAction(async () => new Response(null, { status: 204, headers: BEARER_CORS }));

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
  if (!boundedString(label, 1, 120) || !label.trim() || !printable(label)) return json({ error: "label must be 1-120 printable characters (self-reported)" }, 400);
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
  const { token, expiresAt } = await mintPlayerJwt({
    subject: grant.subject, credentialId: grant.credentialId, roomId: grant.roomId, permission: grant.permission,
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
const jwksRoute = guarded(async () => json(await jwks(), 200, { "Cache-Control": "public, max-age=300" }));

/** Unknown /api/* paths are a JSON 404, never the SPA's index.html. */
const apiNotFound = httpAction(async () => jsonResponse({ error: "Not found" }, 404));

export function registerAuthRoutes(http: HttpRouter) {
  http.route({ path: "/api/device/request", method: "POST", handler: deviceRequest });
  http.route({ path: "/api/device/poll", method: "POST", handler: devicePoll });
  http.route({ path: "/api/device/token", method: "POST", handler: deviceToken });
  http.route({ path: "/api/device/revoke", method: "POST", handler: deviceRevoke });
  http.route({ path: "/api/.well-known/jwks.json", method: "GET", handler: jwksRoute });
  for (const path of ["/api/device/request", "/api/device/poll", "/api/device/token", "/api/device/revoke", "/api/.well-known/jwks.json", "/api/config"]) {
    http.route({ path, method: "OPTIONS", handler: preflight });
  }
  for (const method of ["GET", "POST"] as const) http.route({ pathPrefix: "/api/", method, handler: apiNotFound });
}
