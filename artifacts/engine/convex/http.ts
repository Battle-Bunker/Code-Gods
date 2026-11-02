/**
 * Every HTTP URL of the deployment (https://<dep>.convex.site):
 *
 *   /api/auth/*   Better Auth: Google sign-in, session cookie, sign-out, Convex JWTs (convex/auth/betterAuth.ts)
 *   /mcp          the MCP server (convex/agent/mcp.ts); /.well-known/oauth-*, /oauth/authorize[/complete] and
 *                 /api/oauth/{register,token,revoke}: its OAuth authorization server (convex/agent/oauth.ts)
 *   /api/*        exact routes: device flow, player JWKS, config, health (convex/auth/routes.ts); any other
 *                 /api/ path is a JSON 404 (a longer prefix than "/", so it beats the SPA fallback)
 *   /client/*     the reference player client (static-hosting instance `playerSite`, built with base /client/); the
 *                 client itself is path-independent and runs from any dev server at / too (artifacts/player-web)
 *   /player[/*]   308 to the same path under /client/ (the client's old prefix: links and bookmarks keep working)
 *   /*            engine UI (static-hosting instance `engineSite`, built with base /)
 *
 * Convex matches exact paths first, then the LONGEST matching pathPrefix, which is what lets the two
 * static catch-alls and the /api/ 404 coexist.
 */
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { mcp, mcpMethodNotAllowed } from "./agent/mcp";
import { registerOAuthRoutes } from "./agent/oauth";
import { registerAuthRoutes } from "./auth/routes";
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

// The engine UI's cookie session: same origin only, no CORS (player clients use room tokens: docs/external-clients.md).
// Registers /api/auth/* and /.well-known/openid-configuration.
authComponent.registerRoutes(http, createAuth);
// MCP (convex/agent/mcp.ts) and its OAuth authorization server (convex/agent/oauth.ts).
http.route({ path: "/mcp", method: "POST", handler: mcp });
for (const method of ["GET", "DELETE"] as const) http.route({ path: "/mcp", method, handler: mcpMethodNotAllowed });
registerOAuthRoutes(http);
registerAuthRoutes(http);
// The player client's old prefix: /player → /client, /player/x?y → /client/x?y. Only that exact segment (not /players).
const toClient = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  return new Response(null, { status: 308, headers: { Location: `${url.pathname.replace(/^\/player/, "/client")}${url.search}` } });
});
http.route({ path: "/player", method: "GET", handler: toClient });
http.route({ pathPrefix: "/player/", method: "GET", handler: toClient });
registerStaticRoutes(http, components.playerSite, { pathPrefix: "/client/" });
registerStaticRoutes(http, components.engineSite);

export default http;
