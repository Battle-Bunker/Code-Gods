/**
 * scripts/preview-setup.mjs: what a preview deployment's setup may touch and which env vars it writes.
 * Each test names the break it catches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { envPlan, refusal } from "../../scripts/preview-setup.mjs";

const target = { CONVEX_SELF_HOSTED_URL: "https://happy-otter-1.convex.cloud", CONVEX_SELF_HOSTED_ADMIN_KEY: "k" };
const fixed = { generateKey: async () => ({ privateKey: "-----BEGIN-----\nabc\n-----END-----\n", jwks: '{"keys":[]}' }), random: (n: number) => `r${n}` };

test("the preview setup never runs against a deploy key's deployment, nor dev or production", () => {
  assert.equal(refusal(target), null);
  assert.match(refusal({ ...target, CONVEX_DEPLOY_KEY: "dev:quixotic-gopher-395|x" })!, /CONVEX_DEPLOY_KEY is set/);
  assert.match(refusal({ ...target, CONVEX_DEPLOYMENT_TOKEN: "x" })!, /CONVEX_DEPLOY_KEY is set/);
  assert.match(refusal({})!, /must name the preview/);
  assert.match(refusal({ ...target, CONVEX_SELF_HOSTED_URL: "https://quixotic-gopher-395.convex.cloud" })!, /dev or production/);
  assert.match(refusal({ ...target, CONVEX_SELF_HOSTED_URL: "https://original-bear-509.convex.cloud" })!, /dev or production/);
});

test("a new preview gets its own generated secrets, placeholders for Google, the preview admin, and the passphrase", async () => {
  const plan = await envPlan([], { PREVIEW_SIGN_IN_CODE: " correct horse battery " }, fixed);
  assert.deepEqual(plan.set, {
    BETTER_AUTH_SECRET: "r32", PLAYER_JWT_PRIVATE_KEY: "-----BEGIN-----\\nabc\\n-----END-----", PLAYER_JWT_JWKS: '{"keys":[]}', SEASON_SALT: "preview-r24",
    GOOGLE_CLIENT_ID: "preview-no-google.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "preview-no-google",
    ADMIN_EMAILS: "admin@preview.test", PREVIEW_SIGN_IN_CODE: "correct horse battery",
  });
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.signIn, true);
});

test("a later run keeps the preview's keys, secret and salt (sessions and seasons survive a push)", async () => {
  const existing = ["BETTER_AUTH_SECRET", "PLAYER_JWT_PRIVATE_KEY", "PLAYER_JWT_JWKS", "SEASON_SALT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ADMIN_EMAILS", "BETTER_AUTH_JWKS", "PREVIEW_SIGN_IN_CODE"];
  const plan = await envPlan(existing, { PREVIEW_SIGN_IN_CODE: "a new passphrase!" }, fixed);
  assert.deepEqual(plan.set, { PREVIEW_SIGN_IN_CODE: "a new passphrase!" }, "only the passphrase follows the repository secret");
});

test("without the passphrase secret the sign-in is switched off, never left on with an old passphrase", async () => {
  const plan = await envPlan(["PREVIEW_SIGN_IN_CODE", "BETTER_AUTH_SECRET"], {}, fixed);
  assert.deepEqual(plan.remove, ["PREVIEW_SIGN_IN_CODE"]);
  assert.equal(plan.signIn, false);
  assert.equal("PREVIEW_SIGN_IN_CODE" in plan.set, false);
});

test("a passphrase too short to switch the sign-in on stops the run instead of deploying a preview nobody can enter", async () => {
  await assert.rejects(envPlan([], { PREVIEW_SIGN_IN_CODE: "short" }, fixed), /at least 12 characters/);
  await assert.rejects(envPlan([], { PREVIEW_SIGN_IN_CODE: "two\nlines of passphrase" }, fixed), /one line/);
});

test("AI provider keys are copied only when given; test-only switches are removed", async () => {
  const plan = await envPlan(["TEST_FIXTURES", "AI_MOCK", "OPENAI_API_KEY"], { PREVIEW_ANTHROPIC_API_KEY: "sk-ant" }, fixed);
  assert.equal(plan.set.ANTHROPIC_API_KEY, "sk-ant");
  assert.equal("OPENAI_API_KEY" in plan.set, false, "an absent secret never overwrites or removes a key set by hand");
  assert.deepEqual(plan.remove, ["TEST_FIXTURES", "AI_MOCK"]);
});
