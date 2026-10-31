#!/usr/bin/env node
/**
 * Build and upload both static sites to the deployment's two static-hosting instances.
 *
 *   pnpm --filter @workspace/engine deploy-static            the `npx convex dev` deployment (local or cloud dev),
 *                                                            or the one CONVEX_DEPLOY_KEY names (CI)
 *   pnpm --filter @workspace/engine deploy-static --prod     production (after `npx convex deploy`)
 *   … --skip-build                                           upload existing dist directories
 *   … --engine-dist DIR --player-dist DIR                    upload other directories (e.g. test fixtures)
 *   … --only engine|player                                   one site
 *
 *   engine UI       artifacts/code-gods   → instance engineSite, served at /         (Vite base "/")
 *   player client   artifacts/player-web  → instance playerSite, served at /player/  (Vite base "/player/")
 *
 * Both builds get VITE_CONVEX_URL = the deployment's client URL (https://<dep>.convex.cloud) and VITE_CONVEX_SITE_URL
 * (its site URL, where the stored-panel frame loads its runtime from: the frame CSP names it), read
 * from the component itself, never from a local .env. With a custom domain, the deployment's env var SITE_URL
 * reaches the build as CODE_GODS_SITE_URL (the build-side name; an exported CODE_GODS_SITE_URL is used when the
 * deployment has none): the frame CSP then names that origin too (besides 'self'). Each upload is atomic
 * (the previous version stays live if it fails) and garbage-collects the previous upload. SPA fallback stays on.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "..");
export const SITES = {
  engine: { component: "engineSite", pkg: "@workspace/code-gods", dir: resolve(artifacts, "code-gods"), base: "/" },
  player: { component: "playerSite", pkg: "@workspace/player-web", dir: resolve(artifacts, "player-web"), base: "/player/" },
};
// With a deploy key the key picks the deployment; otherwise the configured one (.env.local), else the local anonymous one.
const env = process.env.CONVEX_DEPLOY_KEY ? { ...process.env } : { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  return result;
}

/** {siteUrl, cloudUrl} of the deployment, as the static-hosting component reports them. */
export function deploymentUrls({ prod = false } = {}) {
  const result = spawnSync("npx", ["convex", "run", "--component", "engineSite", "lib:getUrls", "{}", ...(prod ? ["--prod"] : [])], {
    cwd: root, env, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Could not read deployment URLs (is the backend pushed?)\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

/** The deployment's custom public origin (its env var SITE_URL), or "" when it has none. */
export function publicSiteUrl({ prod = false } = {}) {
  const result = spawnSync("npx", ["convex", "env", "get", "SITE_URL", ...(prod ? ["--prod"] : [])], { cwd: root, env, encoding: "utf8" });
  // An unset variable prints nothing and succeeds; a failure must not silently drop the custom origin from the CSP.
  if (result.status !== 0) throw new Error(`Could not read the deployment's SITE_URL\n${result.stderr}`);
  return result.stdout.trim();
}

export function buildSite(site, convexUrl, siteUrl, publicUrl = "") {
  run("pnpm", ["--filter", site.pkg, "run", "build"], {
    cwd: artifacts, env: { ...env, NODE_ENV: "production", BASE_PATH: site.base, VITE_CONVEX_URL: convexUrl,
      ...(siteUrl ? { VITE_CONVEX_SITE_URL: siteUrl } : {}), ...(publicUrl ? { CODE_GODS_SITE_URL: publicUrl } : {}) },
  });
  return resolve(site.dir, "dist/public");
}

export function uploadSite(component, dist, { prod = false } = {}) {
  run("npx", ["@convex-dev/static-hosting", "upload", "--component", component, "--dist", dist, ...(prod ? ["--prod"] : [])]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const prod = argv.includes("--prod"), skipBuild = argv.includes("--skip-build");
  const only = arg("--only");
  const { cloudUrl, siteUrl } = deploymentUrls({ prod });
  const publicUrl = skipBuild ? "" : publicSiteUrl({ prod });
  console.log(`[deploy-static] VITE_CONVEX_URL=${cloudUrl} site=${siteUrl}${publicUrl ? ` public=${publicUrl}` : ""}`);
  for (const [name, site] of Object.entries(SITES)) {
    if (only && only !== name) continue;
    const dist = arg(`--${name}-dist`) ? resolve(arg(`--${name}-dist`)) : skipBuild ? resolve(site.dir, "dist/public") : buildSite(site, cloudUrl, siteUrl, publicUrl);
    uploadSite(site.component, dist, { prod });
    console.log(`[deploy-static] ${name} → ${siteUrl.replace(/\/$/, "")}${site.base}`);
  }
}
