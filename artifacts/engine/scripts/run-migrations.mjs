#!/usr/bin/env node
/**
 * Runs the deployment's schema migrations (convex/migrations.ts `runAll`, the @convex-dev/migrations component) and
 * waits until every one of them reports success: the deploy workflow's migration step, and scripts/dev.mjs on a
 * local deployment. CLAUDE.md "Schema migrations".
 *
 *   node scripts/run-migrations.mjs            the deployment CONVEX_DEPLOY_KEY names (CI), else the local one
 *   node scripts/run-migrations.mjs --prod     production
 *
 * The component runs each migration online, in batches, once per deployment: a migration already done is skipped,
 * a half-done one resumes where it stopped. This script only starts the series and watches `migrations:status`;
 * it exits 1 when one fails or is canceled, or when they are not done within MIGRATION_TIMEOUT_S (default 1800).
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod") ? ["--prod"] : [];
const env = process.env.CONVEX_DEPLOY_KEY ? { ...process.env } : { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE ?? "anonymous" };
const timeoutMs = Number(process.env.MIGRATION_TIMEOUT_S ?? 1800) * 1000;
const run = (args) => spawnSync("npx", ["convex", "run", ...args, ...prod], { cwd: root, env, encoding: "utf8" });

const started = run(["migrations:runAll"]);
if (started.status !== 0) {
  console.error(`[migrations] could not start runAll:\n${started.stderr}`);
  process.exit(1);
}
const deadline = Date.now() + timeoutMs;
for (;;) {
  const result = run(["migrations:status"]);
  if (result.status !== 0) { console.error(`[migrations] status unavailable:\n${result.stderr}`); process.exit(1); }
  const statuses = JSON.parse(result.stdout);
  const bad = statuses.filter(s => s.state === "failed" || s.state === "canceled");
  if (bad.length) {
    for (const s of bad) console.error(`[migrations] ${s.name}: ${s.state}${s.error ? ` (${s.error})` : ""}`);
    process.exit(1);
  }
  const pending = statuses.filter(s => s.state !== "success");
  if (!pending.length) {
    for (const s of statuses) console.log(`[migrations] ${s.name}: done (${s.processed} processed)`);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.error(`[migrations] still running after ${timeoutMs / 1000} s: ${pending.map(s => `${s.name} ${s.state} (${s.processed})`).join(", ")}`);
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 2000));
}
