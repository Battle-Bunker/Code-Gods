#!/usr/bin/env node
/**
 * Local engine: the official Convex CLI's local backend (`npx convex dev`, anonymous local deployment;
 * no Convex account) + the stand-in OIDC provider, with test-only environment variables.
 *
 *   pnpm --filter @workspace/engine dev
 *     → backend http://127.0.0.1:3210 (client URL), site http://127.0.0.1:3211 (HTTP actions + static sites),
 *       fake OIDC http://127.0.0.1:3399. Sign in at http://127.0.0.1:3211/api/login and pick an identity
 *       (alice, bob, carol, admin, unverified; see scripts/fake-oidc.mjs).
 *
 * Environment overrides (read by this script, not by the deployment):
 *   CONVEX_LOCAL_CLOUD_PORT / CONVEX_LOCAL_SITE_PORT   backend ports (default 3210 / 3211)
 *   FAKE_OIDC_PORT                                     stand-in OIDC port (default 3399)
 *   CODE_GODS_SEASON_SALT                              keep a fixed salt (default: keep the deployment's, else random)
 * Extra arguments are passed to the long-running `npx convex dev`.
 *
 * What it does: (1) starts the fake OIDC server; (2) `convex dev --once` creates/pushes the local
 * deployment; (3) sets the deployment env vars below; (4) runs `convex dev` (watch), whose first push
 * re-evaluates auth.config.ts with the JWKS. It prints "[dev] READY" once that push has finished.
 *
 * Deployment env vars set here (LOCAL ONLY; production must not set REPLIT_OIDC_ISSUER,
 * CODE_GODS_AI_MOCK or CODE_GODS_TEST_FIXTURES):
 *   CODE_GODS_JWT_PRIVATE_KEY, CODE_GODS_JWT_JWKS  generated once per local deployment (kept afterwards)
 *   REPLIT_OIDC_ISSUER        → the fake OIDC server
 *   REPLIT_OIDC_CLIENT_ID     code-gods-local
 *   CODE_GODS_ADMIN_EMAILS    admin@example.test (the fake "admin" identity)
 *   CODE_GODS_SEASON_SALT, CODE_GODS_AI_MOCK=1, CODE_GODS_TEST_FIXTURES=1 (enables convex/auth/testing.ts)
 */
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeOidc } from "./fake-oidc.mjs";
import { generateJwtKey } from "./gen-jwt-key.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cloudPort = process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210";
const sitePort = process.env.CONVEX_LOCAL_SITE_PORT ?? "3211";
const oidcPort = Number(process.env.FAKE_OIDC_PORT ?? 3399);
const clientId = "code-gods-local";
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
const ports = ["--local-cloud-port", cloudPort, "--local-site-port", sitePort];
const convex = (args, options = {}) => spawnSync("npx", ["convex", ...args], { cwd: root, env, encoding: "utf8", ...options });

const oidc = await startFakeOidc({ port: oidcPort, clientId });
console.log(`[dev] fake OIDC at ${oidc.issuer} (local tests only)`);

// 1. Create/push the deployment so it exists.
if (convex(["dev", "--once", "--typecheck", "disable", ...ports], { stdio: "inherit" }).status !== 0) process.exit(1);

// 2. Test-only environment. Keep an existing JWT key and season salt so sessions survive restarts.
const current = name => (convex(["env", "get", name]).stdout ?? "").trim();
const vars = {
  REPLIT_OIDC_ISSUER: oidc.issuer,
  REPLIT_OIDC_CLIENT_ID: clientId,
  CODE_GODS_ADMIN_EMAILS: "admin@example.test",
  CODE_GODS_SEASON_SALT: process.env.CODE_GODS_SEASON_SALT ?? (current("CODE_GODS_SEASON_SALT") || `local-${randomBytes(16).toString("hex")}`),
  CODE_GODS_AI_MOCK: "1",
  CODE_GODS_TEST_FIXTURES: "1",
};
if (!current("CODE_GODS_JWT_JWKS")) {
  const key = await generateJwtKey();
  // Single-line form for the .env file; convex/auth/jwt.ts turns "\n" escapes back into newlines.
  Object.assign(vars, { CODE_GODS_JWT_PRIVATE_KEY: key.privateKey.trim().replace(/\n/g, "\\n"), CODE_GODS_JWT_JWKS: key.jwks });
}
const dir = mkdtempSync(join(tmpdir(), "cg-env-"));
const file = join(dir, "local.env");
writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join("\n") + "\n", { mode: 0o600 });
const set = convex(["env", "set", "--force", "--from-file", file], { stdio: ["ignore", "ignore", "inherit"] });
rmSync(dir, { recursive: true, force: true });
if (set.status !== 0) { console.error("[dev] setting env vars failed"); process.exit(1); }
console.log(`[dev] env: ${Object.keys(vars).join(", ")}`);

// 3. Watch mode. Its first push re-evaluates auth.config.ts with CODE_GODS_JWT_JWKS.
const child = spawn("npx", ["convex", "dev", ...ports, ...process.argv.slice(2)], { cwd: root, env, stdio: ["inherit", "pipe", "pipe"] });
let ready = false;
const watch = (stream, out) => stream.on("data", chunk => {
  out.write(chunk);
  // The CLI logs progress on stderr; the first "functions ready" after the env change is the signal.
  if (!ready && /Convex functions ready/.test(String(chunk))) {
    ready = true;
    console.log(`[dev] READY cloud=http://127.0.0.1:${cloudPort} site=http://127.0.0.1:${sitePort} oidc=${oidc.issuer}`);
  }
});
watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);
const stop = () => { child.kill("SIGINT"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", async code => { await oidc.close(); process.exit(code ?? 0); });
