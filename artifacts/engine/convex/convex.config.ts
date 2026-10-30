import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

/**
 * Two static sites from one deployment, in the component's "app-owned root routing" mode: neither
 * instance has an httpPrefix, so convex/http.ts owns every URL. /api/* stays at stable root URLs,
 * /player/* serves the default player client and everything else the engine UI (both with SPA fallback).
 * Uploads: scripts/deploy-static.mjs (`upload --component engineSite|playerSite`).
 */
const app = defineApp();
app.use(staticHosting, { name: "engineSite" });
app.use(staticHosting, { name: "playerSite" });

export default app;
