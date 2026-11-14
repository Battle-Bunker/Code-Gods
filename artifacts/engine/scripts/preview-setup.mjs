#!/usr/bin/env node
/**
 * Everything a PREVIEW deployment needs after its first push (.github/workflows/preview.yml; docs/preview-deployments.md):
 * the same steps the dev deploy runs, plus the secrets a brand-new deployment lacks, generated here.
 *
 *   node scripts/preview-setup.mjs --env-only   step 1 alone, BEFORE the first push: the workflow passes it to
 *                                               `npx convex deploy --preview-name <name> --cmd …`, which runs it once
 *                                               the preview exists and before the functions are pushed (the order
 *                                               Convex's Better Auth guide uses), so the very first push already
 *                                               finds its secrets. Reaches the preview the documented way: the preview
 *                                               deploy key in CONVEX_DEPLOY_KEY plus `--preview-name $PREVIEW_NAME`.
 *   node scripts/preview-setup.mjs              everything, after that push and after
 *                                               `.github/scripts/preview.mjs credentials <name>`
 *
 * The full run only ever talks to the deployment named by CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY (the
 * Convex CLI's URL + admin key variables, which the `credentials` step fills in for the preview), and refuses to start
 *   - without them, or with CONVEX_DEPLOY_KEY set (that key could name dev or production), or
 *   - when the URL is the dev or production deployment.
 * `--env-only` refuses any CONVEX_DEPLOY_KEY that is not a preview deploy key (`preview:<team>:<project>|…`), which
 * can only ever reach previews.
 *
 * Steps (each idempotent, so a later push to the same preview repeats them safely and keeps its data and sessions):
 *   1. env vars, only where missing: BETTER_AUTH_SECRET, PLAYER_JWT_PRIVATE_KEY + PLAYER_JWT_JWKS, SEASON_SALT
 *      (generated for this preview alone), GOOGLE_CLIENT_ID/SECRET (placeholders: Google cannot redirect to a preview),
 *      ADMIN_EMAILS (the preview player "Ada Admin"). Always refreshed from this process's environment:
 *      PREVIEW_SIGN_IN_CODE (the passphrase of the preview sign-in; removed when absent), and ANTHROPIC_API_KEY /
 *      OPENAI_API_KEY when PREVIEW_ANTHROPIC_API_KEY / PREVIEW_OPENAI_API_KEY are given.
 *   2. BETTER_AUTH_JWKS on the first run (rotateKeys), then a second push so auth.config.ts inlines both key sets.
 *   3. functions version, the schema migrations (waited for), the static site (built with VITE_PREVIEW_SIGN_IN=1
 *      when the passphrase is set, so the app's Sign in button opens the preview sign-in).
 *   4. a health check; prints `site=<url>` (and writes `site_url` to GITHUB_OUTPUT).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateJwtKey } from "./gen-jwt-key.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The dev and production deployments (PILOT.md "Automatic deploys"): never a preview. */
export const PROTECTED_DEPLOYMENTS = ["quixotic-gopher-395", "original-bear-509"];
export const PREVIEW_CODE_MIN_LENGTH = 12;   // convex/auth/identity.ts

/** Why this environment must not run the preview setup, or null when it may. */
export function refusal(env) {
  if (env.CONVEX_DEPLOY_KEY || env.CONVEX_DEPLOYMENT_TOKEN) return "CONVEX_DEPLOY_KEY is set: the preview setup only runs against the preview named by CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY";
  if (!env.CONVEX_SELF_HOSTED_URL || !env.CONVEX_SELF_HOSTED_ADMIN_KEY) return "CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY must name the preview deployment";
  const hit = PROTECTED_DEPLOYMENTS.find(name => env.CONVEX_SELF_HOSTED_URL.includes(name));
  if (hit) return `${hit} is the dev or production deployment, not a preview`;
  return null;
}

/** Why `--env-only` must not run in this environment, or null: it needs a preview deploy key and the preview's name. */
export function envOnlyRefusal(env) {
  const [prefix, secret] = String(env.CONVEX_DEPLOY_KEY ?? "").split("|");
  const parts = prefix.split(":");
  if (!secret || parts.length !== 3 || parts[0] !== "preview") return "--env-only needs a preview deploy key (preview:<team>:<project>|…) in CONVEX_DEPLOY_KEY: any other key could name dev or production";
  if (env.CONVEX_SELF_HOSTED_URL || env.CONVEX_SELF_HOSTED_ADMIN_KEY) return "--env-only runs with the preview deploy key alone: CONVEX_SELF_HOSTED_URL must not be set";
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(env.PREVIEW_NAME ?? "")) return "PREVIEW_NAME must be the preview's name (.github/scripts/preview.mjs name <branch>)";
  return null;
}

/**
 * The env var changes for a preview: `set` (name → value) and `remove` (names), from the names the deployment already
 * has and this process's environment. Existing keys, secret and salt are kept, so sessions survive a re-run.
 */
export async function envPlan(existing, env, { generateKey = generateJwtKey, random = n => randomBytes(n).toString("base64url") } = {}) {
  const has = name => existing.includes(name);
  /** @type {Record<string, string>} */
  const set = {};
  /** @type {string[]} */
  const remove = [];
  if (!has("BETTER_AUTH_SECRET")) set.BETTER_AUTH_SECRET = random(32);
  if (!has("PLAYER_JWT_PRIVATE_KEY") || !has("PLAYER_JWT_JWKS")) {
    const key = await generateKey();
    set.PLAYER_JWT_PRIVATE_KEY = key.privateKey.trim().replace(/\n/g, "\\n");   // one line; convex/auth/jwt.ts restores the newlines
    set.PLAYER_JWT_JWKS = key.jwks;
  }
  if (!has("SEASON_SALT")) set.SEASON_SALT = `preview-${random(24)}`;
  if (!has("GOOGLE_CLIENT_ID")) set.GOOGLE_CLIENT_ID = "preview-no-google.apps.googleusercontent.com";
  if (!has("GOOGLE_CLIENT_SECRET")) set.GOOGLE_CLIENT_SECRET = "preview-no-google";
  if (!has("ADMIN_EMAILS")) set.ADMIN_EMAILS = "admin@preview.test";
  const code = (env.PREVIEW_SIGN_IN_CODE ?? "").trim();
  if (code && code.length < PREVIEW_CODE_MIN_LENGTH) throw new Error(`PREVIEW_SIGN_IN_CODE must be at least ${PREVIEW_CODE_MIN_LENGTH} characters`);
  if (/[\r\n']/.test(code)) throw new Error("PREVIEW_SIGN_IN_CODE must be one line without a single quote");
  if (code) set.PREVIEW_SIGN_IN_CODE = code;
  else if (has("PREVIEW_SIGN_IN_CODE")) remove.push("PREVIEW_SIGN_IN_CODE");
  for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
    const value = (env[`PREVIEW_${name}`] ?? "").trim();
    if (value) set[name] = value;
  }
  // Test-only switches never belong on a shared deployment (deploy.yml refuses them on dev and production too).
  for (const name of ["DEV", "TEST_FIXTURES", "AI_MOCK", "FAKE_OIDC_URL"]) if (has(name) && !env.PREVIEW_SETUP_KEEP_TEST_VARS) remove.push(name);
  return { set, remove, signIn: Boolean(code) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envOnly = process.argv.includes("--env-only");
  const why = envOnly ? envOnlyRefusal(process.env) : refusal(process.env);
  if (why) { console.error(`::error::${why}`); process.exit(1); }
  const env = { ...process.env };
  /** `--env-only`: the preview by name, with the preview deploy key. Otherwise the URL + admin key in the environment. */
  const target = envOnly ? ["--preview-name", process.env.PREVIEW_NAME] : [];
  const step = title => console.log(`\n[preview] ${title}`);
  const convex = (args, options = {}) => spawnSync("npx", ["convex", ...args, ...(["env", "run"].includes(args[0]) ? target : [])], { cwd: root, env, encoding: "utf8", ...options });
  const must = (result, what) => { if (result.status !== 0) { console.error(`::error::${what} failed\n${result.stderr ?? ""}`); process.exit(1); } return result; };
  const run = (command, args, what, options = {}) => must(spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options }), what);
  /** Values go in on stdin: never in a process list or the log. */
  const setEnv = (name, value) => must(convex(["env", "set", name], { input: value, stdio: ["pipe", "ignore", "inherit"] }), `convex env set ${name}`);
  const names = () => must(convex(["env", "list", "--names-only"]), "convex env list").stdout.split("\n").map(s => s.trim()).filter(Boolean);

  step("Environment variables");
  const plan = await envPlan(names(), process.env);
  for (const [name, value] of Object.entries(plan.set)) setEnv(name, value);
  for (const name of plan.remove) must(convex(["env", "remove", name], { stdio: ["ignore", "ignore", "inherit"] }), `convex env remove ${name}`);
  console.log(`set: ${Object.keys(plan.set).join(", ") || "nothing"}; removed: ${plan.remove.join(", ") || "nothing"}`);
  if (envOnly) process.exit(0);

  if (!names().includes("BETTER_AUTH_JWKS")) {
    step("Better Auth signing key (first run only)");
    const rotated = must(convex(["run", "auth/betterAuth:rotateKeys"]), "rotateKeys");
    let jwks = "";
    try { const parsed = JSON.parse(rotated.stdout); if ((Array.isArray(parsed) ? parsed : parsed.keys)?.length) jwks = JSON.stringify(parsed); } catch { /* reported below */ }
    if (!jwks) { console.error("::error::rotateKeys returned no keys"); process.exit(1); }
    setEnv("BETTER_AUTH_JWKS", jwks);
  }
  step("Push again (auth.config.ts inlines the key sets)");
  run("npx", ["convex", "deploy", "--typecheck", "disable"], "convex deploy");   // typechecked by the first push

  step("Version, migrations");
  const sha = (process.env.PREVIEW_SHA ?? process.env.GITHUB_SHA ?? "preview").slice(0, 12);
  run("npx", ["convex", "run", "version:record", JSON.stringify({ site: "functions", build: sha })], "version:record");
  run("node", ["scripts/run-migrations.mjs"], "schema migrations");
  run("node", ["scripts/upload-runtime.mjs"], "upload-runtime (Python bundle for v2 agents)");

  step("Static site");
  run("node", ["scripts/deploy-static.mjs", ...(process.env.PREVIEW_STATIC_ARGS ? process.env.PREVIEW_STATIC_ARGS.split(" ") : [])], "deploy-static",
    { env: { ...env, ...(plan.signIn ? { VITE_PREVIEW_SIGN_IN: "1" } : {}) } });

  step("Health check");
  const urls = JSON.parse(must(convex(["run", "--component", "engineSite", "lib:getUrls", "{}"]), "getUrls").stdout);
  const site = urls.siteUrl.replace(/\/+$/, "");
  const health = await fetch(`${site}/api/health`);
  if (!health.ok) { console.error(`::error::${site}/api/health answered ${health.status}`); process.exit(1); }
  if (plan.signIn) {
    const start = await fetch(`${site}/api/preview-auth/start`);
    if (!start.ok) { console.error(`::error::${site}/api/preview-auth/start answered ${start.status}: the preview sign-in is not being served`); process.exit(1); }
  }
  console.log(`site=${site}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `site_url=${site}\nsign_in=${plan.signIn}\n`);
}
