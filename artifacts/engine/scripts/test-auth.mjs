#!/usr/bin/env node
/**
 * Runs test/auth.test.ts against a live LOCAL backend:  pnpm --filter @workspace/engine test:auth
 *
 * Starts scripts/dev.mjs on ports 3310/3311 with the fake OIDC on 3398 (override with
 * CONVEX_LOCAL_CLOUD_PORT / CONVEX_LOCAL_SITE_PORT / FAKE_OIDC_PORT), uploads two small fixture sites
 * (or, with --real-builds, the real frontends' builds) to engineSite/playerSite, runs the tests and
 * stops everything it started.
 */
import "./local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITES, buildSite, uploadSite } from "./deploy-static.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cloudPort = process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3310";
const sitePort = process.env.CONVEX_LOCAL_SITE_PORT ?? "3311";
const oidcPort = process.env.FAKE_OIDC_PORT ?? "3398";
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous", CONVEX_LOCAL_CLOUD_PORT: cloudPort, CONVEX_LOCAL_SITE_PORT: sitePort, FAKE_OIDC_PORT: oidcPort };

const dev = spawn(process.execPath, [resolve(root, "scripts/dev.mjs"), "--typecheck", "disable"], { cwd: root, env, stdio: ["ignore", "pipe", "inherit"], detached: true });
const stopDev = () => { try { process.kill(-dev.pid, "SIGINT"); } catch { /* already gone */ } };
process.on("exit", stopDev);
process.on("SIGINT", () => process.exit(130));

await new Promise((resolveReady, reject) => {
  const timer = setTimeout(() => reject(new Error("backend did not become ready within 5 minutes")), 300_000);
  dev.stdout.on("data", chunk => {
    process.stdout.write(chunk);
    if (String(chunk).includes("[dev] READY")) { clearTimeout(timer); resolveReady(); }
  });
  dev.on("exit", code => reject(new Error(`dev.mjs exited (${code})`)));
});

let fixtures;
if (process.argv.includes("--real-builds")) {
  for (const site of Object.values(SITES)) uploadSite(site.component, buildSite(site, `http://127.0.0.1:${cloudPort}`, `http://127.0.0.1:${sitePort}`));
} else {
  fixtures = mkdtempSync(join(tmpdir(), "cg-static-"));
  for (const [name, site] of Object.entries(SITES)) {
    const dist = join(fixtures, name);
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"),
      `<!doctype html><html><head><script type="module" src="${site.base}assets/index-Fx7${name}9a.js"></script></head><body><div id="${name}-fixture"></div></body></html>\n`);
    writeFileSync(join(dist, "assets", `index-Fx7${name}9a.js`), `console.log("${name} fixture");\n`);
    uploadSite(site.component, dist);
  }
}

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "test/auth.test.ts"], {
  cwd: root, stdio: "inherit",
  env: { ...env, CG_TEST_CLOUD_URL: `http://127.0.0.1:${cloudPort}`, CG_TEST_SITE_URL: `http://127.0.0.1:${sitePort}`, CG_TEST_OIDC_URL: `http://127.0.0.1:${oidcPort}` },
});
if (fixtures) rmSync(fixtures, { recursive: true, force: true });
stopDev();
process.exit(result.status ?? 1);
