import { test } from "node:test";
import assert from "node:assert/strict";
import { findPassedGate } from "./previous-gate.mjs";

const TREE = "a".repeat(40), REPO = "o/r";
const run = (id, o = {}) => ({ id, status: "completed", head_branch: "develop", head_sha: `sha${id}`, head_repository: { full_name: REPO }, head_commit: { tree_id: TREE }, ...o });
const api = (runs, jobsByRun) => ({ runs: async () => runs, jobs: async (id) => jobsByRun[id] ?? [] });
const checks = (conclusion, status = "completed") => [{ name: "deploy", status: "completed", conclusion: "success" }, { name: "checks", status, conclusion }];

test("a successful checks job on a develop run with the same tree skips the gate, even if that run's deploy failed", async () => {
  const r = await findPassedGate(TREE, REPO, api([run(2)], { 2: [{ name: "checks", status: "completed", conclusion: "success" }, { name: "deploy", status: "completed", conclusion: "failure" }] }));
  assert.equal(r.passed, true);
});

test("never skips: wrong tree, failed/cancelled/running checks, other branch, fork, no runs, bad tree, matrix shards alone", async () => {
  const cases = {
    "other tree": [run(1, { head_commit: { tree_id: "b".repeat(40) } })],
    "failed": [run(1)], "cancelled": [run(1)], "running": [run(1, { status: "in_progress" })],
    "other branch": [run(1, { head_branch: "main" })],
    "fork": [run(1, { head_repository: { full_name: "evil/r" } })],
    "no head commit": [run(1, { head_commit: null })],
    "none": [],
  };
  const jobs = { failed: checks("failure"), cancelled: checks("cancelled"), running: checks(null, "in_progress") };
  for (const [name, runs] of Object.entries(cases)) {
    const j = { 1: jobs[name] ?? checks("success") };
    assert.equal((await findPassedGate(TREE, REPO, api(runs, j))).passed, false, name);
  }
  assert.equal((await findPassedGate("abc", REPO, api([run(1)], { 1: checks("success") }))).passed, false);
  const shardsOnly = [{ name: "checks (utilities 1/8)", status: "completed", conclusion: "success" }];
  assert.equal((await findPassedGate(TREE, REPO, api([run(1)], { 1: shardsOnly }))).passed, false, "only the aggregate `checks` job counts");
});

test("an older green run is found behind a newer red one on the same tree", async () => {
  const r = await findPassedGate(TREE, REPO, api([run(3), run(2)], { 3: checks("failure"), 2: checks("success") }));
  assert.deepEqual([r.passed, /run 2/.test(r.why)], [true, true]);
});

test("an API error is thrown to the CLI wrapper, which turns it into passed=false", async () => {
  await assert.rejects(findPassedGate(TREE, REPO, { runs: async () => { throw new Error("403"); }, jobs: async () => [] }));
});
