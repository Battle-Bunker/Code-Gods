/**
 * Every HTTP URL of the deployment (https://<dep>.convex.site):
 *
 *   /api/auth/*   Better Auth: Google sign-in, session cookie, sign-out, Convex JWTs (convex/auth/betterAuth.ts)
 *   /api/v2/replay/<gameId>  an engine v2 game's stored replay, for a member of its room (convex/v2Http.ts)
 *   /mcp          the MCP server (convex/agent/mcp.ts; its tools come from the affordance directory); /.well-known/oauth-*,
 *                 /oauth/authorize[/complete] and /api/oauth/{register,token,revoke}: its OAuth authorization server
 *                 (convex/agent/oauth.ts)
 *   /api/preview-auth/*  preview deployments only: the passphrase sign-in (convex/auth/previewRoutes.ts); a 404 elsewhere
 *   /api/*        exact routes: device flow, player JWKS, config, health (convex/auth/routes.ts); any other
 *                 /api/ path is a JSON 404 (a longer prefix than "/", so it beats the SPA fallback)
 *   /*            the app (artifacts/player-web; static-hosting instance `engineSite`, built with base /)
 *
 * Convex matches exact paths first, then the LONGEST matching pathPrefix, which is what lets the static catch-all and
 * the /api/ 404 coexist.
 */
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { mcp, mcpMethodNotAllowed } from "./agent/mcp";
import { registerOAuthRoutes } from "./agent/oauth";
import { registerAuthRoutes } from "./auth/routes";
import { registerPreviewAuthRoutes } from "./auth/previewRoutes";
import { v2ReplayDownload, v2ReplayPreflight } from "./v2Http";
import { authComponent, createAuth } from "./auth/betterAuth";

const http = httpRouter();

const VERSION = "0.1.0";
http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => {
    // TODO(runtime): add `runtimes: ["python", "typescript"]` from convex/runtime once it lands (§12 smoke test).
    const body = { ok: true, version: process.env.VERSION || VERSION };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }),
});

/**
 * Discovery for player apps: a player configures only the engine's website URL (this origin), and
 * learns the Convex client URL here. Public, no secrets.
 */
http.route({
  path: "/api/config",
  method: "GET",
  handler: httpAction(async () => {
    const body = {
      convexUrl: process.env.CONVEX_CLOUD_URL, siteUrl: process.env.SITE_URL || process.env.CONVEX_SITE_URL,
      version: process.env.VERSION || VERSION,
    };
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  }),
});

// The site's Google session: same origin only, no CORS (other origins use OAuth grants: docs/external-clients.md).
// Registers /api/auth/* and /.well-known/openid-configuration.
authComponent.registerRoutes(http, createAuth);
// MCP (convex/agent/mcp.ts) and its OAuth authorization server (convex/agent/oauth.ts).
http.route({ path: "/mcp", method: "POST", handler: mcp });
// Engine v2: an ended game's stored replay, for a member of its room (convex/v2/replays.ts): the JWT in Authorization.
http.route({ pathPrefix: "/api/v2/replay/", method: "GET", handler: v2ReplayDownload });
http.route({ pathPrefix: "/api/v2/replay/", method: "OPTIONS", handler: v2ReplayPreflight });
for (const method of ["GET", "DELETE"] as const) http.route({ path: "/mcp", method, handler: mcpMethodNotAllowed });
registerOAuthRoutes(http);
registerPreviewAuthRoutes(http);   // preview deployments only (a JSON 404 everywhere else): auth/preview.ts
registerAuthRoutes(http);
registerStaticRoutes(http, components.engineSite);

export default http;
