/**
 * Every HTTP URL of the deployment (https://<dep>.convex.site):
 *
 *   /api/*        exact routes: login, device flow, JWKS, health (convex/auth/routes.ts); any other
 *                 /api/ path is a JSON 404 (a longer prefix than "/", so it beats the SPA fallback)
 *   /player/*     default player client (static-hosting instance `playerSite`, built with base /player/)
 *   /*            engine UI (static-hosting instance `engineSite`, built with base /)
 *
 * Convex matches exact paths first, then the LONGEST matching pathPrefix, which is what lets the two
 * static catch-alls and the /api/ 404 coexist.
 */
import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { registerAuthRoutes } from "./auth/routes";

const http = httpRouter();

const VERSION = "0.1.0";
http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => {
    // TODO(runtime): add `runtimes: ["python", "typescript"]` from convex/runtime once it lands (§12 smoke test).
    const body = { ok: true, version: process.env.CODE_GODS_VERSION || VERSION };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }),
});

registerAuthRoutes(http);
registerStaticRoutes(http, components.playerSite, { pathPrefix: "/player/" });
registerStaticRoutes(http, components.engineSite);

export default http;
