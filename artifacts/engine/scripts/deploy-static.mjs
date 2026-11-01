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
 *   … --if-changed                                           skip the upload of a site whose build hashes to the marker
 *                                                            recorded at its last upload (deployment env var
 *                                                            STATIC_SHA256_ENGINE / _PLAYER, set on every upload)
 *
 *   engine UI       artifacts/code-gods   → instance engineSite, served at /         (Vite base "/")
 *   player client   artifacts/player-web  → instance playerSite, served at /client/  (Vite base "/client/";
 *                                                            the old /player/ prefix redirects there, convex/http.ts)
 *
 * Both builds get VITE_CONVEX_URL = the deployment's client URL (https://<dep>.convex.cloud) and VITE_CONVEX_SITE_URL
 * (its site URL, where the stored-panel frame loads its runtime from: the frame CSP names it), read
 * from the component itself, never from a local .env. With a custom domain, the deployment's env var SITE_URL
 * reaches the build as CODE_GODS_SITE_URL (the build-side name; an exported CODE_GODS_SITE_URL is used when the
 * deployment has none): the frame CSP then names that origin too (besides 'self'). Each upload is atomic
 * (the previous version stays live if it fails) and garbage-collects the previous upload. SPA fallback stays on.
 * Each site's index.html is stamped with its build id (a hash of the build) and, after the upload, the id is recorded
 * (`version:record`), so open pages of an older build update themselves (lib/player-client/src/update.ts). The two sites build and upload concurrently. With --if-changed, a site whose build is byte-identical to its last
 * upload (the URLs above are baked into the build, so they count) isn't uploaded again; a build that differs in any
 * byte, even a minifier's harmless variation, uploads as usual.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "..");
export const SITES = {
  engine: { component: "engineSite", pkg: "@workspace/code-gods", dir: resolve(artifacts, "code-gods"), base: "/" },
  player: { component: "playerSite", pkg: "@workspace/player-web", dir: resolve(artifacts, "player-web"), base: "/client/" },
};
// With a deploy key the key picks the deployment; otherwise the configured one (.env.local), else the local anonymous one.
const env = process.env.CONVEX_DEPLOY_KEY ? { ...process.env } : { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  return result;
}

function runAsync(command, args, options = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", ...options });
    child.on("error", fail);
    child.on("exit", code => code === 0 ? ok() : fail(new Error(`${command} ${args.join(" ")} failed (${code})`)));
  });
}

/** SHA-256 over a dist tree: each file's relative path, size and bytes, in sorted path order. */
export function distHash(dir) {
  const files = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : files.push(relative(dir, join(d, e.name)));
  };
  walk(dir);
  const hash = createHash("sha256");
  for (const f of files.sort()) {
    const bytes = readFileSync(join(dir, f));
    hash.update(`${f}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest("hex");
}

const BUILD_META = /<meta name="code-gods-build" content="[^"]*">/;
/**
 * Stamps the build's id into dist/index.html as `<meta name="code-gods-build" content="…">` (the name is BUILD_META in
 * lib/player-client/src/build-meta.ts) and returns it; null without an index.html or a </head>. The id is the
 * distHash of the tree without the stamp, so it follows every file (the panel frame, the CSP, public/), a
 * byte-identical build gets the same id, and stamping again changes nothing. Recorded with `version:record` after the
 * upload: open pages of an older build then update themselves (lib/player-client/src/update.ts).
 */
export function stampBuildId(dist) {
  const file = join(dist, "index.html");
  let html;
  try { html = readFileSync(file, "utf8"); } catch { return null; }
  const bare = html.replace(BUILD_META, "");
  if (!/<\/head>/i.test(bare)) return null;
  writeFileSync(file, bare);
  const id = distHash(dist).slice(0, 16);
  writeFileSync(file, bare.replace(/<\/head>/i, `<meta name="code-gods-build" content="${id}"></head>`));   // exactly what BUILD_META strips
  return id;
}

/** Records the live build of a site (engine | player) so open pages learn of the deploy. */
function recordBuild(name, build, prodFlag) {
  run("npx", ["convex", "run", "version:record", JSON.stringify({ site: name, build }), ...prodFlag], { stdio: ["ignore", "ignore", "inherit"] });
}

const markerName = name => `STATIC_SHA256_${name.toUpperCase()}`;
/** The hash recorded at the site's last upload; "" when unset or unreadable (then the site uploads). */
function readMarker(name, { prod = false } = {}) {
  const result = spawnSync("npx", ["convex", "env", "get", markerName(name), ...(prod ? ["--prod"] : [])], { cwd: root, env, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
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

const buildOptions = (site, convexUrl, siteUrl, publicUrl) => ({
  cwd: artifacts, env: { ...env, NODE_ENV: "production", BASE_PATH: site.base, VITE_CONVEX_URL: convexUrl,
    ...(siteUrl ? { VITE_CONVEX_SITE_URL: siteUrl } : {}), ...(publicUrl ? { CODE_GODS_SITE_URL: publicUrl } : {}) },
});

export function buildSite(site, convexUrl, siteUrl, publicUrl = "") {
  run("pnpm", ["--filter", site.pkg, "run", "build"], buildOptions(site, convexUrl, siteUrl, publicUrl));
  return resolve(site.dir, "dist/public");
}

export function uploadSite(component, dist, { prod = false } = {}) {
  run("npx", ["@convex-dev/static-hosting", "upload", "--component", component, "--dist", dist, ...(prod ? ["--prod"] : [])]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const prod = argv.includes("--prod"), skipBuild = argv.includes("--skip-build"), ifChanged = argv.includes("--if-changed");
  const only = arg("--only");
  const { cloudUrl, siteUrl } = deploymentUrls({ prod });
  const publicUrl = skipBuild ? "" : publicSiteUrl({ prod });
  console.log(`[deploy-static] VITE_CONVEX_URL=${cloudUrl} site=${siteUrl}${publicUrl ? ` public=${publicUrl}` : ""}`);
  const prodFlag = prod ? ["--prod"] : [];
  await Promise.all(Object.entries(SITES).filter(([name]) => !only || only === name).map(async ([name, site]) => {
    let dist = arg(`--${name}-dist`) ? resolve(arg(`--${name}-dist`)) : skipBuild ? resolve(site.dir, "dist/public") : "";
    if (!dist) {
      await runAsync("pnpm", ["--filter", site.pkg, "run", "build"], buildOptions(site, cloudUrl, siteUrl, publicUrl));
      dist = resolve(site.dir, "dist/public");
    }
    const build = stampBuildId(dist), hash = distHash(dist);
    if (ifChanged && readMarker(name, { prod }) === hash) {
      // Recorded again anyway (a no-op when it is already the live build): the live build is always in version:current.
      if (build) recordBuild(name, build, prodFlag);
      console.log(`[deploy-static] ${name} unchanged (${hash.slice(0, 12)}), upload skipped`);
      return;
    }
    await runAsync("npx", ["@convex-dev/static-hosting", "upload", "--component", site.component, "--dist", dist, ...prodFlag]);
    // Recorded on every upload, with or without --if-changed, so the marker always names the live build.
    run("npx", ["convex", "env", "set", markerName(name), hash, ...prodFlag], { stdio: ["ignore", "ignore", "inherit"] });
    // After the upload, never before: a page told of a build that is not served yet would reload into the old one.
    if (build) recordBuild(name, build, prodFlag);
    else console.warn(`[deploy-static] ${name}: no index.html with a </head> to stamp; open pages will not update themselves`);
    console.log(`[deploy-static] ${name} → ${siteUrl.replace(/\/$/, "")}${site.base}${build ? ` (build ${build})` : ""}`);
  }));
}
