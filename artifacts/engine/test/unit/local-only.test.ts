/**
 * Local-only scripts refuse to run when CONVEX_DEPLOY_KEY is set, or CONVEX_DEPLOYMENT names a cloud deployment
 * (scripts/local-only.mjs). They set test-only env vars (DEV, TEST_FIXTURES, FAKE_OIDC_URL, …) and upload fixture
 * sites with the Convex CLI, which follows either to a cloud deployment. Each script must refuse before it starts
 * or changes anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const node = [process.execPath, "--disable-warning=ExperimentalWarning", "--experimental-transform-types"];
const UNREACHABLE = { CONVEX_LOCAL_CLOUD_PORT: "1", CONVEX_LOCAL_SITE_PORT: "1", CG_TEST_SITE_URL: "http://127.0.0.1:1",
  CG_TEST_CLOUD_URL: "http://127.0.0.1:1", CODE_GODS_SITE_URL: "http://127.0.0.1:1" };
const run = (script: string, env: Record<string, string>) => spawnSync(node[0], [...node.slice(1), script], {
  cwd: ROOT, encoding: "utf8", timeout: 30_000,
  // Unreachable ports: if the guard were missing, nothing local would answer and nothing would be reused.
  env: { ...process.env, CONVEX_DEPLOY_KEY: "", CONVEX_DEPLOYMENT_TOKEN: "", CONVEX_SELF_HOSTED_URL: "", CONVEX_DEPLOYMENT: "", ...UNREACHABLE, ...env },
});
const SCRIPTS = [
  "artifacts/engine/scripts/dev.mjs",
  "artifacts/engine/scripts/test-auth.mjs",
  "artifacts/engine/scripts/assistant-provider.mjs",
  "lib/player-client/scripts/test.mjs",
  "artifacts/code-gods/e2e/smoke.ts",
  "artifacts/player-web/e2e/multi-client.ts",
  "artifacts/player-web/e2e/stored-panels.ts",
];

for (const script of SCRIPTS) {
  test(`${script} refuses to run with CONVEX_DEPLOY_KEY set (it would touch a cloud deployment)`, () => {
    const result = run(script, { CONVEX_DEPLOY_KEY: "dev:not-a-deployment|test" });
    assert.equal(result.status, 1, `exit status (stderr: ${result.stderr})`);
    assert.match(result.stderr, /CONVEX_DEPLOY_KEY is set/);
    assert.doesNotMatch(result.stdout + result.stderr, /fake OIDC at|starting|convex dev/i, "nothing was started");
  });
}

test("a CONVEX_DEPLOYMENT naming a cloud deployment, a deployment token or a self-hosted URL is refused too; the local anonymous deployment is not", () => {
  for (const deployment of ["dev:not-a-deployment", "prod:not-a-deployment"]) {
    const result = run(SCRIPTS[0], { CONVEX_DEPLOYMENT: deployment });
    assert.equal(result.status, 1, deployment);
    assert.match(result.stderr, /CONVEX_DEPLOYMENT is set/);
  }
  for (const name of ["CONVEX_DEPLOYMENT_TOKEN", "CONVEX_SELF_HOSTED_URL"]) {
    const result = run(SCRIPTS[0], { [name]: name === "CONVEX_SELF_HOSTED_URL" ? "https://convex.example.org" : "token" });
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, new RegExp(`${name} is set`));
  }
  // The guard alone, so nothing starts: "anonymous:…" (the local backend) passes it.
  const local = spawnSync(process.execPath, ["scripts/local-only.mjs"], { cwd: `${ROOT}artifacts/engine`, encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOY_KEY: "", CONVEX_DEPLOYMENT_TOKEN: "", CONVEX_SELF_HOSTED_URL: "", CONVEX_DEPLOYMENT: "anonymous:anonymous-engine" } });
  assert.equal(local.status, 0, local.stderr);
});
