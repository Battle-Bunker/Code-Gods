/**
 * Imported first (as a side effect) by every script that drives a LOCAL backend: scripts/dev.mjs,
 * scripts/test-auth.mjs, the e2e scripts and the player-client test runner. They set test-only deployment env
 * vars (DEV, TEST_FIXTURES, AI_MOCK, FAKE_OIDC_URL) and upload fixture sites through the Convex CLI, and the
 * CLI follows CONVEX_DEPLOY_KEY, CONVEX_DEPLOYMENT_TOKEN, the self-hosted variables, or a CONVEX_DEPLOYMENT
 * naming a cloud deployment ("dev:…", "prod:…"; also read from artifacts/engine/.env.local) to that deployment.
 * So with any of them they refuse to start, before touching anything.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const dotenv = (() => {
  try { return readFileSync(new URL("../.env.local", import.meta.url), "utf8"); } catch { return ""; }
})();
const fileDeployment = dotenv.match(/^\s*CONVEX_DEPLOYMENT\s*=\s*["']?([^"'\s#]*)/m)?.[1] ?? "";
const cloudDeployment = value => /^(dev|prod|preview):/.test(value ?? "");
const cloud = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL"].find(name => process.env[name])
  ?? (cloudDeployment(process.env.CONVEX_DEPLOYMENT) ? "CONVEX_DEPLOYMENT"
    : !process.env.CONVEX_DEPLOYMENT && cloudDeployment(fileDeployment) ? "CONVEX_DEPLOYMENT (in artifacts/engine/.env.local)" : null);
if (cloud) {
  console.error(`${basename(process.argv[1] ?? "this script")} runs only against the local backend, but ${cloud} is set, ` +
    "which points the Convex CLI at another deployment. Unset it (e.g. `env -u NAME …`) and run it again.");
  process.exit(1);
}
