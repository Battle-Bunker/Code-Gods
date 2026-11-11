#!/usr/bin/env node
/**
 * Helpers of .github/workflows/preview.yml (docs/preview-deployments.md). Logic only; tested in preview.test.mjs.
 *
 *   node .github/scripts/preview.mjs name <branch>          the preview's name for a branch (printed)
 *   node .github/scripts/preview.mjs credentials <name>     asks Convex for the named preview's URL and admin key with
 *                                                           the preview deploy key in CONVEX_DEPLOY_KEY, and hands them
 *                                                           to the following steps as CONVEX_SELF_HOSTED_URL and
 *                                                           CONVEX_SELF_HOSTED_ADMIN_KEY (masked), plus the step
 *                                                           outputs `deployment` and `cloud_url`
 *   node .github/scripts/preview.mjs delete <name>          deletes the named preview with CONVEX_TEAM_ACCESS_TOKEN
 *                                                           (optional; exit 0 and a note when the token is absent)
 *   node .github/scripts/preview.mjs comment                creates or updates the one preview comment on the pull
 *                                                           request (PR_NUMBER, COMMENT_BODY, GH_TOKEN, GITHUB_REPOSITORY)
 *
 * Why `credentials`: a preview deploy key selects a project, not a deployment. The Convex CLI reaches a named preview
 * with the hidden flag `--preview-name`, but the static-site uploader (`npx @convex-dev/static-hosting upload`) and
 * our own upload scripts call `convex run` without it. So this asks Convex's API the same question the CLI asks for
 * `--preview-name` (convex/src/cli/lib/api.ts handlePreview: POST deployment/authorize_preview) and gives every later
 * command the answer through the CLI's documented URL + admin key variables, which need no flag.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CONVEX_API = process.env.CONVEX_PROVISION_HOST || "https://api.convex.dev";
export const COMMENT_MARKER = "<!-- code-gods-preview -->";
/** The deployments a preview run must never touch (PILOT.md "Automatic deploys"): dev and production. */
export const PROTECTED_DEPLOYMENTS = ["quixotic-gopher-395", "original-bear-509"];

/** A branch name as a preview name: lower case, [a-z0-9-] only, at most 40 characters; the same branch always gives the same name. */
export function previewName(branch) {
  const name = String(branch ?? "").replace(/^refs\/heads\//, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  if (!name) throw new Error(`No preview name can be made from the branch "${branch}"`);
  return name;
}

/** {teamSlug, projectSlug} of a preview deploy key (`preview:<team>:<project>|<secret>`); throws for any other key. */
export function projectOfPreviewKey(key) {
  const [prefix, secret] = String(key ?? "").split("|");
  const parts = prefix.split(":");
  if (!secret || parts.length !== 3 || parts[0] !== "preview" || !parts[1] || !parts[2]) {
    throw new Error("CONVEX_PREVIEW_DEPLOY_KEY is not a preview deploy key (expected preview:<team>:<project>|…). " +
      "Generate one in the Convex dashboard: project Settings → Preview Deploy Keys (docs/preview-deployments.md).");
  }
  return { teamSlug: parts[1], projectSlug: parts[2] };
}

/** The deployment name inside a Convex URL (https://<name>.convex.cloud), or "" for any other URL. */
export const deploymentOfUrl = url => /^https:\/\/([a-z0-9-]+)\.convex\.(cloud|site)\/?$/.exec(String(url ?? ""))?.[1] ?? "";

/** Refuses anything that is not a preview: the answer must say "preview" and must not be dev or production. */
export function assertPreview({ deploymentName, deploymentType, url }) {
  const names = [deploymentName, deploymentOfUrl(url)].filter(Boolean);
  if (deploymentType !== "preview") throw new Error(`Convex answered with a "${deploymentType}" deployment, not a preview: stopping`);
  const hit = names.find(n => PROTECTED_DEPLOYMENTS.includes(n));
  if (hit) throw new Error(`${hit} is the dev or production deployment, not a preview: stopping`);
}

/** The named preview's {adminKey, url, deploymentName, deploymentType}: what the CLI's `--preview-name` resolves to. */
export async function previewCredentials(previewKey, name, fetchImpl = fetch) {
  const response = await fetchImpl(`${CONVEX_API}/api/deployment/authorize_preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${previewKey}`, "Convex-Client": "npm-cli-1.48.0", "Content-Type": "application/json" },
    body: JSON.stringify({ previewName: name, projectSelection: { kind: "teamAndProjectSlugs", ...projectOfPreviewKey(previewKey) } }),
  });
  if (!response.ok) throw new Error(`Convex refused the preview "${name}" (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  if (!data?.adminKey || !data?.url) throw new Error(`Convex's answer for the preview "${name}" has no admin key or URL`);
  assertPreview(data);
  return data;
}

/** The pull request comment: where the preview is, how to sign in, what it is built from. */
export function commentBody({ siteUrl, name, sha, branch, signIn }) {
  const site = siteUrl.replace(/\/+$/, "");
  return [
    COMMENT_MARKER,
    `**Preview:** ${site}`,
    "",
    signIn
      ? "Sign in with the button on the page: type the preview passphrase (the `PREVIEW_SIGN_IN_CODE` secret) and pick a test player. **Ada Admin** sees the admin-only setups. Use a private window to be a second player."
      : "Sign-in is **not available** on this preview: add the repository secret `PREVIEW_SIGN_IN_CODE` (docs/preview-deployments.md) and re-run the Preview workflow.",
    "",
    `Built from \`${branch}\` at ${sha.slice(0, 7)}, merged with the latest \`develop\`. Data starts empty and is kept across pushes; Convex deletes the preview automatically (5 days after it was created on the free plan, 14 on paid plans). Name in the Convex dashboard: \`${name}\`.`,
  ].join("\n");
}

/** Create the preview comment on the pull request, or update the one already there. */
export async function upsertComment({ repo, pr, body, token }, fetchImpl = fetch) {
  const api = (path, init = {}) => fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const list = await api(`/issues/${pr}/comments?per_page=100`);
  if (!list.ok) throw new Error(`Listing the pull request's comments failed (${list.status})`);
  const existing = (await list.json()).find(c => typeof c.body === "string" && c.body.includes(COMMENT_MARKER));
  const saved = existing
    ? await api(`/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) })
    : await api(`/issues/${pr}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  if (!saved.ok) throw new Error(`Writing the preview comment failed (${saved.status})`);
  return existing ? "updated" : "created";
}

/** Delete a preview through Convex's Management API (a team access token; a preview deploy key cannot delete). */
export async function deletePreview({ previewKey, teamToken, name }, fetchImpl = fetch) {
  const { deploymentName } = await previewCredentials(previewKey, name, fetchImpl);   // also checks it is a preview
  const response = await fetchImpl(`${CONVEX_API}/v1/deployments/${deploymentName}/delete`, { method: "POST", headers: { Authorization: `Bearer ${teamToken}` } });
  if (!response.ok) throw new Error(`Deleting ${deploymentName} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return deploymentName;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  const out = (file, line) => { if (file) appendFileSync(file, `${line}\n`); };
  try {
    if (command === "name") {
      console.log(previewName(arg));
    } else if (command === "credentials") {
      const data = await previewCredentials(process.env.CONVEX_DEPLOY_KEY, arg);
      console.log(`::add-mask::${data.adminKey}`);
      out(process.env.GITHUB_ENV, `CONVEX_SELF_HOSTED_URL=${data.url}`);
      out(process.env.GITHUB_ENV, `CONVEX_SELF_HOSTED_ADMIN_KEY=${data.adminKey}`);
      out(process.env.GITHUB_OUTPUT, `deployment=${data.deploymentName ?? deploymentOfUrl(data.url)}`);
      out(process.env.GITHUB_OUTPUT, `cloud_url=${data.url}`);
      console.log(`Preview "${arg}" is ${data.url}`);
    } else if (command === "delete") {
      if (!process.env.CONVEX_TEAM_ACCESS_TOKEN) {
        console.log(`No CONVEX_TEAM_ACCESS_TOKEN secret: the preview "${arg}" is left for Convex to delete automatically (or delete it in the dashboard).`);
      } else {
        const deleted = await deletePreview({ previewKey: process.env.CONVEX_DEPLOY_KEY, teamToken: process.env.CONVEX_TEAM_ACCESS_TOKEN, name: arg });
        console.log(`Deleted the preview "${arg}" (${deleted}).`);
        out(process.env.GITHUB_OUTPUT, "deleted=true");
      }
    } else if (command === "comment") {
      const result = await upsertComment({ repo: process.env.GITHUB_REPOSITORY, pr: process.env.PR_NUMBER, body: process.env.COMMENT_BODY, token: process.env.GH_TOKEN });
      console.log(`Preview comment ${result}.`);
    } else {
      throw new Error("usage: preview.mjs name <branch> | credentials <name> | delete <name> | comment");
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
