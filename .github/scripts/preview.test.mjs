/** .github/scripts/preview.mjs: the logic the Preview workflow relies on. Each test names the break it catches. */
import test from "node:test";
import assert from "node:assert/strict";
import { COMMENT_MARKER, assertPreview, commentBody, deletePreview, deploymentOfUrl, previewCredentials, previewName, projectOfPreviewKey, upsertComment } from "./preview.mjs";

const KEY = "preview:my-team:code-gods|c2VjcmV0";
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

test("a branch always maps to the same safe preview name", () => {
  assert.equal(previewName("variant/Energy_Capacity.v2"), "variant-energy-capacity-v2");
  assert.equal(previewName("refs/heads/claude/distance-cost"), "claude-distance-cost");
  assert.equal(previewName("a".repeat(39) + "/b"), "a".repeat(39), "cut to 40 without a trailing dash");
  assert.throws(() => previewName("///"), /No preview name/);
  assert.throws(() => previewName(undefined), /No preview name/);
});

test("only a preview deploy key is accepted: a dev or production key stops the run before anything is asked", async () => {
  assert.deepEqual(projectOfPreviewKey(KEY), { teamSlug: "my-team", projectSlug: "code-gods" });
  for (const key of ["dev:quixotic-gopher-395|abc", "prod:original-bear-509|abc", "project:t:p|abc", "", undefined, "preview:team:project"]) {
    assert.throws(() => projectOfPreviewKey(key), /not a preview deploy key/, String(key));
  }
  let called = false;
  await assert.rejects(previewCredentials("prod:original-bear-509|abc", "x", async () => { called = true; return reply(200, {}); }), /not a preview deploy key/);
  assert.equal(called, false);
});

test("credentials: asks Convex what the CLI asks for --preview-name, and refuses an answer that is not a preview", async () => {
  let seen;
  const good = { adminKey: "preview:happy-otter-1|k", url: "https://happy-otter-1.convex.cloud", deploymentName: "happy-otter-1", deploymentType: "preview" };
  const data = await previewCredentials(KEY, "variant-x", async (url, init) => { seen = { url, init }; return reply(200, good); });
  assert.deepEqual(data, good);
  assert.equal(seen.url, "https://api.convex.dev/api/deployment/authorize_preview");
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(seen.init.body), { previewName: "variant-x", projectSelection: { kind: "teamAndProjectSlugs", teamSlug: "my-team", projectSlug: "code-gods" } });
  await assert.rejects(previewCredentials(KEY, "x", async () => reply(404, { message: "no such preview" })), /refused the preview "x" \(404\)/);
  await assert.rejects(previewCredentials(KEY, "x", async () => reply(200, { url: good.url })), /no admin key/);
  await assert.rejects(previewCredentials(KEY, "x", async () => reply(200, { ...good, deploymentType: "prod" })), /not a preview/);
  await assert.rejects(previewCredentials(KEY, "x", async () => reply(200, { ...good, deploymentName: "quixotic-gopher-395" })), /dev or production/);
  await assert.rejects(previewCredentials(KEY, "x", async () => reply(200, { ...good, deploymentName: undefined, url: "https://original-bear-509.convex.cloud" })), /dev or production/);
});

test("deployment names are read only from Convex URLs", () => {
  assert.equal(deploymentOfUrl("https://happy-otter-1.convex.cloud"), "happy-otter-1");
  assert.equal(deploymentOfUrl("https://happy-otter-1.convex.site/"), "happy-otter-1");
  assert.equal(deploymentOfUrl("https://example.com"), "");
  assert.doesNotThrow(() => assertPreview({ deploymentType: "preview", url: "https://custom.example" }));
});

test("the comment says where the preview is and, without the passphrase secret, that nobody can sign in", () => {
  const base = { siteUrl: "https://happy-otter-1.convex.site/", name: "variant-x", sha: "0123456789abcdef", branch: "variant/x" };
  const on = commentBody({ ...base, signIn: true });
  assert.ok(on.startsWith(COMMENT_MARKER));
  assert.match(on, /\*\*Preview:\*\* https:\/\/happy-otter-1\.convex\.site\n/);
  assert.match(on, /`variant\/x` at 0123456/);
  assert.match(on, /Ada Admin/);
  assert.match(commentBody({ ...base, signIn: false }), /not available.*PREVIEW_SIGN_IN_CODE/);
});

test("the pull request keeps ONE preview comment: updated when it exists, created otherwise", async () => {
  const calls = [];
  const github = comments => async (url, init = {}) => { calls.push([init.method ?? "GET", url.replace("https://api.github.com/repos/o/r", "")]); return reply(200, comments); };
  assert.equal(await upsertComment({ repo: "o/r", pr: 7, body: "b", token: "t" }, github([{ id: 1, body: "hello" }])), "created");
  assert.deepEqual(calls.at(-1), ["POST", "/issues/7/comments"]);
  assert.equal(await upsertComment({ repo: "o/r", pr: 7, body: "b", token: "t" }, github([{ id: 1, body: "hello" }, { id: 2, body: `${COMMENT_MARKER}\nold` }])), "updated");
  assert.deepEqual(calls.at(-1), ["PATCH", "/issues/comments/2"]);
  await assert.rejects(upsertComment({ repo: "o/r", pr: 7, body: "b", token: "t" }, async () => reply(403, {})), /failed \(403\)/);
});

test("delete: only the deployment Convex names for that preview, and never dev or production", async () => {
  const calls = [];
  const convex = answer => async (url, init) => { calls.push([url, init.headers.Authorization]); return url.includes("authorize_preview") ? reply(200, answer) : reply(200, {}); };
  const preview = { adminKey: "k", url: "https://happy-otter-1.convex.cloud", deploymentName: "happy-otter-1", deploymentType: "preview" };
  assert.equal(await deletePreview({ previewKey: KEY, teamToken: "team-token", name: "variant-x" }, convex(preview)), "happy-otter-1");
  assert.deepEqual(calls.at(-1), ["https://api.convex.dev/v1/deployments/happy-otter-1/delete", "Bearer team-token"]);
  const before = calls.length;
  await assert.rejects(deletePreview({ previewKey: KEY, teamToken: "team-token", name: "x" }, convex({ ...preview, deploymentName: "original-bear-509" })), /dev or production/);
  assert.equal(calls.length, before + 1, "no delete call was made");
});
