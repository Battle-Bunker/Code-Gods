/**
 * .github/workflows/deploy.yml's queueing (a mistake here stops every deploy, or cancels every gate):
 * - one run per branch at a time, and a run that has started always finishes (gate and deploy of one commit);
 *   GitHub keeps only the newest waiting run, so the latest commit is always the next one run;
 * - no job cancels another run's job in progress;
 * - `checks` fails only on a real failure: a part that was cancelled (e.g. by hand) skips it instead;
 * - production still waits for `checks`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yml = readFileSync(new URL("../workflows/deploy.yml", import.meta.url), "utf8");
/** The text of a top-level key's block (up to the next top-level key). */
const block = (key) => {
  const m = yml.match(new RegExp(`^${key}:\\n([\\s\\S]*?)(?=^\\S)`, "m"));
  return m ? m[1] : null;
};
/** The text of one job (up to the next job at two spaces). */
const job = (name) => {
  const m = yml.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  \\S|(?![\\s\\S]))`, "m"));
  assert.ok(m, `job ${name}`);
  return m[1];
};

test("one run per branch at a time, never cancelled by a newer push", () => {
  const c = block("concurrency");
  assert.ok(c, "a workflow-level concurrency block");
  assert.match(c, /group: deploy-run-\$\{\{ github\.ref_name \}\}/);
  assert.match(c, /cancel-in-progress: false/);
});

test("no job cancels a run in progress, and the job-level groups never equal the workflow's", () => {
  assert.doesNotMatch(yml, /cancel-in-progress: (true|\$\{\{)/);
  for (const g of yml.matchAll(/group: (\S+)/g)) if (!g[1].startsWith("deploy-run-")) assert.doesNotMatch(g[1], /^deploy-run-/);
  for (const name of ["typecheck", "unit", "runtime"]) assert.doesNotMatch(job(name), /concurrency:/, `${name} queues with its run`);
});

test("checks: success only when every part succeeded; a cancelled part skips it rather than failing it", () => {
  const checks = job("checks");
  assert.match(checks, /needs: \[lookup, typecheck, unit, runtime\]/);
  assert.match(checks, /!contains\(needs\.\*\.result, 'cancelled'\)/);
  assert.match(checks, /\[ "\$r" = success \] \|\| \{ echo "::error::The gate did not pass"; exit 1; \}/);
});

test("production still waits for the gate and fails on anything but a successful checks job", () => {
  const deploy = job("deploy");
  assert.match(deploy, /name: Wait for the gate\n\s+if: github\.ref_name == 'main'/);
  assert.match(deploy, /"completed success"\) exit 0 ;;/);
  assert.match(deploy, /completed\*\) echo "::error::The gate failed: nothing is deployed to production"; exit 1 ;;/);
  assert.match(deploy, /group: deploy-\$\{\{ github\.ref_name == 'main' && 'production' \|\| 'development' \}\}/);
});
