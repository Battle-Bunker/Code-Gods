/**
 * Imported first (as a side effect) by every script that drives a LOCAL backend: scripts/dev.mjs,
 * scripts/test-auth.mjs, the e2e scripts and the player-client test runner. They set test-only deployment env
 * vars (DEV, TEST_FIXTURES, AI_MOCK, FAKE_OIDC_URL) and upload fixture sites through the Convex CLI, and the
 * CLI follows CONVEX_DEPLOY_KEY, or a CONVEX_DEPLOYMENT naming a cloud deployment ("dev:…", "prod:…"), to that
 * deployment. So with either in the environment they refuse to start, before touching anything.
 */
import { basename } from "node:path";

const cloud = process.env.CONVEX_DEPLOY_KEY ? "CONVEX_DEPLOY_KEY"
  : /^(dev|prod|preview):/.test(process.env.CONVEX_DEPLOYMENT ?? "") ? "CONVEX_DEPLOYMENT" : null;
if (cloud) {
  console.error(`${basename(process.argv[1] ?? "this script")} runs only against the local backend, but ${cloud} is set, ` +
    `which points the Convex CLI at a cloud deployment. Unset it (e.g. \`env -u ${cloud} …\`) and run it again.`);
  process.exit(1);
}
