#!/usr/bin/env node
/**
 * Local engine: the official Convex CLI's local backend (`npx convex dev`, anonymous local deployment;
 * no Convex account) + the stand-in OIDC provider, with test-only environment variables.
 *
 *   pnpm --filter @workspace/engine dev
 *     → backend http://127.0.0.1:3210 (client URL), site http://127.0.0.1:3211 (HTTP actions + static sites),
 *       fake OIDC http://127.0.0.1:3399. The engine UI's "Sign in" goes to Google (which refuses the dummy
 *       client id locally); tests and e2e sign in through Better Auth's test-only provider "fake" instead:
 *       POST /api/auth/sign-in/oauth2 {"providerId":"fake"} and pick an identity (alice, bob, carol, admin,
 *       unverified; see scripts/fake-oidc.mjs and test/helpers.ts login()).
 *
 * Environment overrides (read by this script, not by the deployment):
 *   CONVEX_LOCAL_CLOUD_PORT / CONVEX_LOCAL_SITE_PORT   backend ports (default 3210 / 3211)
 *   FAKE_OIDC_PORT                                     stand-in OIDC port (default 3399)
 *   SEASON_SALT                                        keep a fixed salt (default: keep the deployment's, else random)
 * Extra arguments are passed to the long-running `npx convex dev`.
 *
 * What it does: (1) starts the fake OIDC server; (2) `convex dev --once` creates/pushes the local
 * deployment; (3) sets the deployment env vars below; (4) generates Better Auth's static JWKS once
 * (`convex run auth/betterAuth:rotateKeys`); (5) runs `convex dev` (watch), whose first push re-evaluates
 * auth.config.ts with both JWKS; (6) once that push has finished, uploads the Python runtime bundle
 * (scripts/upload-runtime.mjs: built first if missing or stale, skipped if the deployment has it) and the
 * calibration tables (scripts/upload-calibration.mjs; unchanged files are skipped) to the local deployment's
 * file storage, then prints "[dev] READY".
 *
 * Deployment env vars set here (LOCAL ONLY; production must not set FAKE_OIDC_URL,
 * AI_MOCK or TEST_FIXTURES):
 *   PLAYER_JWT_PRIVATE_KEY, PLAYER_JWT_JWKS       player-JWT key, generated once per local deployment (kept)
 *   BETTER_AUTH_SECRET, BETTER_AUTH_JWKS          generated once per local deployment (kept)
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET        dummies: the Google button builds a real authorization URL
 *   FAKE_OIDC_URL   → the fake OIDC server (enables Better Auth's provider "fake" with fixtures on)
 *   ADMIN_EMAILS    admin@example.test (the fake "admin") and unverified@example.test (never verified)
 *   SEASON_SALT, AI_MOCK=1, TEST_FIXTURES=1 (enables convex/auth/testing.ts)
 * and removed: ASSISTANT_LIVE, ANTHROPIC_API_KEY, OPENAI_API_KEY (scripts/assistant-provider.mjs; the assistant starts mocked)
 */
import "./local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeOidc } from "./fake-oidc.mjs";
import { generateJwtKey } from "./gen-jwt-key.mjs";
import { convexRunner, uploadCalibration } from "./upload-calibration.mjs";
import { uploadRuntime } from "./upload-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cloudPort = process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3210";
const sitePort = process.env.CONVEX_LOCAL_SITE_PORT ?? "3211";
const oidcPort = Number(process.env.FAKE_OIDC_PORT ?? 3399);
const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
const ports = ["--local-cloud-port", cloudPort, "--local-site-port", sitePort];
const convex = (args, options = {}) => spawnSync("npx", ["convex", ...args], { cwd: root, env, encoding: "utf8", ...options });

const oidc = await startFakeOidc({ port: oidcPort });
console.log(`[dev] fake OIDC at ${oidc.issuer} (local tests only)`);

// 1. Create/push the deployment so it exists.
if (convex(["dev", "--once", "--typecheck", "disable", ...ports], { stdio: "inherit" }).status !== 0) process.exit(1);

/** Set deployment env vars through a private temp file (values never appear in a process list). */
function setEnv(vars) {
  const dir = mkdtempSync(join(tmpdir(), "cg-env-"));
  const file = join(dir, "local.env");
  writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}='${v}'`).join("\n") + "\n", { mode: 0o600 });
  const set = convex(["env", "set", "--force", "--from-file", file], { stdio: ["ignore", "ignore", "inherit"] });
  rmSync(dir, { recursive: true, force: true });
  if (set.status !== 0) { console.error("[dev] setting env vars failed"); process.exit(1); }
}

// 2. Test-only environment. Keep existing keys, secret and season salt so sessions survive restarts.
const current = name => (convex(["env", "get", name]).stdout ?? "").trim();
const vars = {
  FAKE_OIDC_URL: oidc.issuer,
  GOOGLE_CLIENT_ID: "local-google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "local-google-client-secret",
  ADMIN_EMAILS: "admin@example.test,unverified@example.test",
  SEASON_SALT: process.env.SEASON_SALT ?? (current("SEASON_SALT") || `local-${randomBytes(16).toString("hex")}`),
  AI_MOCK: "1",
  TEST_FIXTURES: "1",
};
if (!current("PLAYER_JWT_JWKS")) {
  const key = await generateJwtKey();
  // Single-line form for the .env file; convex/auth/jwt.ts turns "\n" escapes back into newlines.
  Object.assign(vars, { PLAYER_JWT_PRIVATE_KEY: key.privateKey.trim().replace(/\n/g, "\\n"), PLAYER_JWT_JWKS: key.jwks });
}
// Better Auth encrypts its JWT signing key with BETTER_AUTH_SECRET, so a new secret needs a new JWKS.
const newSecret = !current("BETTER_AUTH_SECRET");
if (newSecret) vars.BETTER_AUTH_SECRET = randomBytes(32).toString("base64url");
setEnv(vars);
console.log(`[dev] env: ${Object.keys(vars).join(", ")}`);
// Back to the mock assistant on every start (scripts/assistant-provider.mjs `live` sets these), so the
// mock-scripted suites (test/game-assistant.test.ts) never reach a real provider and spend money by accident.
for (const name of ["ASSISTANT_LIVE", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  if (current(name) && convex(["env", "remove", name], { stdio: ["ignore", "ignore", "inherit"] }).status !== 0) {
    console.error(`[dev] removing ${name} failed`); process.exit(1);
  }
}

// 3. Better Auth's static JWKS (auth.config.ts inlines it, so Convex never fetches it).
if (newSecret || !current("BETTER_AUTH_JWKS")) {
  const run = convex(["run", "auth/betterAuth:rotateKeys"]);
  let jwks;
  try { jwks = JSON.stringify(JSON.parse(run.stdout)); } catch { /* reported below */ }
  if (run.status !== 0 || !jwks) { console.error(`[dev] generating BETTER_AUTH_JWKS failed: ${run.stderr}`); process.exit(1); }
  setEnv({ BETTER_AUTH_JWKS: jwks });
  console.log("[dev] env: BETTER_AUTH_JWKS");
}

// 4. Watch mode. Its first push re-evaluates auth.config.ts with both JWKS.
const child = spawn("npx", ["convex", "dev", ...ports, ...process.argv.slice(2)], { cwd: root, env, stdio: ["inherit", "pipe", "pipe"] });
let ready = false;
const watch = (stream, out) => stream.on("data", chunk => {
  out.write(chunk);
  // The CLI logs progress on stderr; the first "functions ready" after the env change is the signal.
  if (!ready && /Convex functions ready/.test(String(chunk))) {
    ready = true;
    // 5. The Python runtime bundle and the calibration tables → file storage (each skips what is already there).
    const runner = convexRunner([], root, env), log = line => console.log(`[dev] ${line}`);
    Promise.all([
      uploadRuntime(runner, { log })
        .catch(error => console.error(`[dev] uploading the Python runtime failed (Python games will fail): ${error.message}`)),
      uploadCalibration(runner, { log })
        .catch(error => console.error(`[dev] uploading the calibration tables failed: ${error.message}`)),
    ]).finally(() => console.log(`[dev] READY cloud=http://127.0.0.1:${cloudPort} site=http://127.0.0.1:${sitePort} oidc=${oidc.issuer}`));
  }
});
watch(child.stdout, process.stdout);
watch(child.stderr, process.stderr);
const stop = () => { child.kill("SIGINT"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", async code => { await oidc.close(); process.exit(code ?? 0); });
