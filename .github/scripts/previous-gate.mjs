#!/usr/bin/env node
/**
 * Has the release gate already passed on an identical tree?
 *
 *   node .github/scripts/previous-gate.mjs <tree-sha>      (needs GH_TOKEN with actions:read, GITHUB_REPOSITORY)
 *
 * Prints "passed=true" or "passed=false" (plus a reason on stderr) and always exits 0, so a lookup problem can only
 * ever make the caller run the gate, never skip it. A release is a merge of develop into main, so its tree equals
 * develop's HEAD tree when nothing else changed; the `checks` job of the Deploy run that built that tree on develop
 * is the same gate the production deploy would run (the workflow file is part of the tree). A run counts only when it
 * is a run of this workflow on develop from this repository, its head commit has this exact tree, and its job named
 * `checks` concluded `success`.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const GATE_JOB = "checks";
export const GATE_BRANCH = "develop";

/**
 * @param {string} tree  the tree sha being released
 * @param {string} repo  owner/name
 * @param {{ runs: () => Promise<any[]>, jobs: (runId: number) => Promise<any[]> }} api
 * @returns {Promise<{ passed: boolean, why: string }>}
 */
export async function findPassedGate(tree, repo, api) {
  if (!/^[0-9a-f]{40}$/.test(tree)) return { passed: false, why: `not a tree sha: ${tree}` };
  const candidates = (await api.runs()).filter(r =>
    r.head_branch === GATE_BRANCH
    && r.head_repository?.full_name === repo
    && r.head_commit?.tree_id === tree
    && r.status !== "queued");
  for (const run of candidates) {
    const job = (await api.jobs(run.id)).find(j => j.name === GATE_JOB);
    if (job?.status === "completed" && job.conclusion === "success") {
      return { passed: true, why: `run ${run.id} (${run.head_sha}) passed the gate on the same tree` };
    }
  }
  return { passed: false, why: candidates.length ? `${candidates.length} run(s) on this tree, none with a successful ${GATE_JOB} job` : "no develop run on this tree" };
}

const gh = (path) => JSON.parse(execFileSync("gh", ["api", "-H", "X-GitHub-Api-Version: 2022-11-28", path], { encoding: "utf8", maxBuffer: 64 << 20 }));

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [tree] = process.argv.slice(2), repo = process.env.GITHUB_REPOSITORY ?? "";
  let result;
  try {
    result = await findPassedGate(tree, repo, {
      runs: async () => gh(`repos/${repo}/actions/workflows/deploy.yml/runs?branch=${GATE_BRANCH}&per_page=100`).workflow_runs,
      jobs: async (id) => gh(`repos/${repo}/actions/runs/${id}/jobs?per_page=100`).jobs,
    });
  } catch (e) {
    result = { passed: false, why: `lookup failed: ${e instanceof Error ? e.message : e}` };
  }
  console.error(`previous gate: ${result.why}`);
  console.log(`passed=${result.passed}`);
}
