/**
 * Every HTTP URL of the deployment (https://<dep>.convex.site):
 *
 *   /api/auth/*   Better Auth: Google sign-in, session cookie, sign-out, Convex JWTs (convex/auth/betterAuth.ts)
 *   /mcp          the MCP server (convex/agent/mcp.ts); /.well-known/oauth-*, /oauth/authorize[/complete] and
 *                 /api/oauth/{register,token,revoke}: its OAuth authorization server (convex/agent/oauth.ts)
 *   /api/replay/<roomId>/<gameId>  an ended game's stored replay, for a signed-in caller its replay admits (convex/replays.ts)
 *   /api/calibration/<roomId>/<gameId>/<godId>  a seat's calibration tables, for that player or a replay viewer (convex/calibration/mine.ts)
 *   /api/rule-tables?instance=&family=&params=  one draw's table by instantiation, for any signed-in caller (convex/calibration/draw.ts)
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
import { download as replayDownload, downloadPreflight as replayPreflight } from "./replays";
import { download as tablesDownload, preflight as tablesPreflight } from "./calibration/mine";
import { download as ruleTablesDownload, preflight as ruleTablesPreflight } from "./calibration/draw";
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
for (const method of ["GET", "DELETE"] as const) http.route({ path: "/mcp", method, handler: mcpMethodNotAllowed });
registerOAuthRoutes(http);
// An ended game's stored replay, for a caller its replay admits (convex/replays.ts): the JWT in Authorization.
http.route({ pathPrefix: "/api/replay/", method: "GET", handler: replayDownload });
http.route({ pathPrefix: "/api/replay/", method: "OPTIONS", handler: replayPreflight });
// A player's own calibration tables (convex/calibration/mine.ts): the JWT in Authorization.
http.route({ pathPrefix: "/api/calibration/", method: "GET", handler: tablesDownload });
http.route({ pathPrefix: "/api/calibration/", method: "OPTIONS", handler: tablesPreflight });
// One draw's calibration table by instantiation, for the rule gallery (convex/calibration/draw.ts): the JWT in Authorization.
http.route({ path: "/api/rule-tables", method: "GET", handler: ruleTablesDownload });
http.route({ path: "/api/rule-tables", method: "OPTIONS", handler: ruleTablesPreflight });
registerAuthRoutes(http);
registerStaticRoutes(http, components.engineSite);

export default http;
