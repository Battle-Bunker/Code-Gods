#!/usr/bin/env node
/**
 * pnpm --filter @workspace/player-client test
 *
 * Runs the unit tests, then the live tests against a local engine:
 *   - CG_TEST_SITE_URL set: use that running engine (its site URL, e.g. http://127.0.0.1:3611);
 *   - else, if an engine already answers on http://127.0.0.1:$CONVEX_LOCAL_SITE_PORT (default 3611), use it;
 *   - else start one (`pnpm --filter @workspace/engine dev` on CONVEX_LOCAL_CLOUD_PORT / CONVEX_LOCAL_SITE_PORT /
 *     FAKE_OIDC_PORT, default 3610 / 3611 / 3699), wait for "[dev] READY", and stop it afterwards.
 * The engine must use the stand-in OIDC provider (dev.mjs does this), since the tests sign in as alice, bob and carol.
 */
import "../../../artifacts/engine/scripts/local-only.mjs";   // refuses to run with CONVEX_DEPLOY_KEY set
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = [process.execPath, "--disable-warning=ExperimentalWarning", "--experimental-transform-types", "--test", "--test-concurrency=1"];

const unit = spawnSync(node[0], [...node.slice(1), "test/unit.test.ts", "test/tools.test.ts", "test/catalog.test.ts", "test/lenses.test.ts", "test/layout.test.ts", "test/rules.test.ts"], { cwd: root, stdio: "inherit" });
if (unit.status !== 0) process.exit(unit.status ?? 1);

const sitePort = process.env.CONVEX_LOCAL_SITE_PORT ?? "3611";
const site = process.env.CG_TEST_SITE_URL ?? `http://127.0.0.1:${sitePort}`;
const healthy = async () => { try { return (await fetch(`${site}/api/health`)).ok; } catch { return false; } };

let dev;
if (!(await healthy())) {
  if (process.env.CG_TEST_SITE_URL) { console.error(`No engine at ${site}`); process.exit(1); }
  const env = {
    ...process.env, CONVEX_LOCAL_CLOUD_PORT: process.env.CONVEX_LOCAL_CLOUD_PORT ?? "3610", CONVEX_LOCAL_SITE_PORT: sitePort,
    FAKE_OIDC_PORT: process.env.FAKE_OIDC_PORT ?? "3699",
  };
  console.log(`[player-client test] starting a local engine (site ${site})`);
  dev = spawn("pnpm", ["--filter", "@workspace/engine", "dev", "--typecheck", "disable"], { cwd: root, env, stdio: ["ignore", "pipe", "inherit"], detached: true });
  const stop = () => { try { process.kill(-dev.pid, "SIGINT"); } catch { /* gone */ } };
  process.on("exit", stop);
  process.on("SIGINT", () => process.exit(130));
  await new Promise((ready, fail) => {
    const timer = setTimeout(() => fail(new Error("engine not ready within 5 minutes")), 300_000);
    dev.stdout.on("data", chunk => { if (String(chunk).includes("[dev] READY")) { clearTimeout(timer); ready(); } });
    dev.on("exit", code => fail(new Error(`engine dev exited (${code})`)));
  });
}

const live = spawnSync(node[0], [...node.slice(1), "test/live.test.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, CG_TEST_SITE_URL: site } });
process.exit(live.status ?? 1);
