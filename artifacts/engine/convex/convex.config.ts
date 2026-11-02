import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import betterAuth from "@convex-dev/better-auth/convex.config";

/**
 * The app (artifacts/player-web) as one static site of the deployment, in the component's "app-owned root routing"
 * mode: no httpPrefix, so convex/http.ts owns every URL. /api/* stays at stable root URLs and everything else is the
 * app, with SPA fallback. Uploads: scripts/deploy-static.mjs (`upload --component engineSite`).
 * `betterAuth` holds Better Auth's users, sessions and accounts (convex/auth/betterAuth.ts).
 */
const app = defineApp();
app.use(staticHosting, { name: "engineSite" });
app.use(betterAuth);

export default app;
