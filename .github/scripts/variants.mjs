#!/usr/bin/env node
/**
 * Lists the design-variant branches and whether each is stale or broken, for docs/design-explorations.md.
 *
 *   pnpm run variants                 every remote `variant/*` branch, and every `claude/*` branch changed in the last
 *                                     14 days: commits behind / ahead of develop, whether it merges with develop
 *                                     cleanly, its last commit date (git only; a few seconds)
 *   pnpm run variants -- --check      also, for each branch, in a throwaway worktree: install, the root typecheck
 *                                     (which builds the libraries) and the offline tests other than the long
 *                                     game-utilities suite (`pnpm run test:offline:rest`); minutes per branch
 *   pnpm run variants -- --check --full   … and the game-utilities suite too (`pnpm run test:offline`)
 *   pnpm run variants -- <branch>…    only these branches
 *   … --days N                        how recent a `claude/*` branch must be (default 14)
 *
 * Prints a Markdown table. Reads `origin` only (run `git fetch origin --prune` first for fresh results; this script
 * fetches by itself unless --no-fetch). Never pushes, never touches the current checkout.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "origin/develop";

/** Which remote branches count as variants: every `variant/*`, and `claude/*` committed to within `days` (never calibration data branches). */
export function selectBranches(refs, { now = Date.now(), days = 14, only = [] } = {}) {
  if (only.length) return refs.filter(r => only.includes(r.branch));
  const cutoff = now - days * 86_400_000;
  return refs.filter(r => r.branch.startsWith("variant/")
    || (r.branch.startsWith("claude/") && !r.branch.startsWith("claude/calib/") && r.committedAt >= cutoff));
}

/** One table row's "state" words, most important first. */
export function describe({ behind, ahead, conflicts, check }) {
  const words = [];
  if (ahead === 0) words.push("nothing beyond develop (merged or empty)");
  if (conflicts) words.push("conflicts with develop");
  else if (behind > 0) words.push(`${behind} behind develop`);
  else words.push("up to date with develop");
  if (check) for (const [name, ok] of Object.entries(check)) words.push(`${name} ${ok === null ? "not run" : ok ? "passes" : "FAILS"}`);
  return words.join("; ");
}

export function table(rows) {
  const lines = ["| Branch | Last commit | Ahead | State |", "|---|---|---|---|"];
  for (const r of rows) lines.push(`| \`${r.branch}\` | ${new Date(r.committedAt).toISOString().slice(0, 10)} | ${r.ahead} | ${describe(r)} |`);
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = name => argv.includes(name);
  const daysAt = argv.indexOf("--days");
  const days = daysAt >= 0 ? Number(argv[daysAt + 1]) : 14;
  const only = argv.filter((a, i) => !a.startsWith("--") && !(daysAt >= 0 && i === daysAt + 1));
  const git = (args, options = {}) => spawnSync("git", args, { encoding: "utf8", ...options });
  const out = args => { const r = git(args); if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };

  // Behind/ahead counts need the whole history: a shallow clone (CI, cloud sessions) is completed first.
  const shallow = () => git(["rev-parse", "--is-shallow-repository"]).stdout.trim() === "true";
  if (!flag("--no-fetch")) {
    const fetched = git(["fetch", "origin", "--prune", "--quiet", ...(shallow() ? ["--unshallow"] : [])], { stdio: ["ignore", "ignore", "inherit"] });
    if (fetched.status !== 0) console.error("[variants] git fetch failed: the list below may be out of date");
  }
  if (shallow()) console.error("[variants] this clone is shallow: behind/ahead counts are unreliable (run `git fetch --unshallow`)");
  const refs = out(["for-each-ref", "--format=%(refname:short)\t%(committerdate:unix)", "refs/remotes/origin"]).split("\n").filter(Boolean)
    .map(line => { const [ref, at] = line.split("\t"); return { branch: ref.replace(/^origin\//, ""), committedAt: Number(at) * 1000 }; });
  const rows = selectBranches(refs, { days, only }).map(r => {
    const [behind, ahead] = out(["rev-list", "--left-right", "--count", `${BASE}...origin/${r.branch}`]).split(/\s+/).map(Number);
    // merge-tree writes nothing to the checkout; exit 1 means conflicts.
    const merged = git(["merge-tree", "--write-tree", BASE, `origin/${r.branch}`]).status;
    if (merged !== 0 && merged !== 1) throw new Error(`git merge-tree failed for ${r.branch} (needs git 2.38 or newer)`);
    const conflicts = merged === 1;
    return { ...r, behind, ahead, conflicts };
  }).sort((a, b) => b.committedAt - a.committedAt);

  if (flag("--check")) {
    for (const row of rows) {
      if (row.ahead === 0) continue;
      const dir = mkdtempSync(join(tmpdir(), "cg-variant-"));
      const step = (command, args) => spawnSync(command, args, { cwd: dir, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, CI: "1" } }).status === 0;
      row.check = { install: null, typecheck: null, "offline tests": null };
      try {
        console.error(`[variants] checking ${row.branch} in ${dir}`);
        out(["worktree", "add", "--detach", "--quiet", dir, `origin/${row.branch}`]);
        row.check.install = step("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
        if (row.check.install) row.check.typecheck = step("pnpm", ["run", "typecheck"]);
        if (row.check.typecheck) row.check["offline tests"] = step("pnpm", ["run", flag("--full") ? "test:offline" : "test:offline:rest"]);
      } finally {
        git(["worktree", "remove", "--force", dir]);
        rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  console.log(table(rows));
  if (!rows.length) console.log("\n(no variant branches)");
}
