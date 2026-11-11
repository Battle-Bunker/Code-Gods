/** .github/scripts/variants.mjs: which branches are listed and how their state reads. */
import test from "node:test";
import assert from "node:assert/strict";
import { describe, selectBranches, table } from "./variants.mjs";

const DAY = 86_400_000, now = 100 * DAY;
const refs = [
  { branch: "develop", committedAt: now }, { branch: "main", committedAt: now },
  { branch: "variant/old-idea", committedAt: now - 60 * DAY },
  { branch: "claude/distance-cost", committedAt: now - DAY },
  { branch: "claude/ancient", committedAt: now - 30 * DAY },
  { branch: "claude/calib/grid-4", committedAt: now },
];

test("variants: every variant/* however old, recent claude/* work, never develop, main or calibration data", () => {
  assert.deepEqual(selectBranches(refs, { now }).map(r => r.branch), ["variant/old-idea", "claude/distance-cost"]);
  assert.deepEqual(selectBranches(refs, { now, days: 40 }).map(r => r.branch), ["variant/old-idea", "claude/distance-cost", "claude/ancient"]);
  assert.deepEqual(selectBranches(refs, { now, only: ["claude/ancient"] }).map(r => r.branch), ["claude/ancient"], "named branches are listed whatever their age");
});

test("a row says first what makes a variant unusable: merged away, conflicting, failing", () => {
  assert.equal(describe({ behind: 0, ahead: 3, conflicts: false }), "up to date with develop");
  assert.equal(describe({ behind: 6, ahead: 3, conflicts: false }), "6 behind develop");
  assert.equal(describe({ behind: 6, ahead: 3, conflicts: true }), "conflicts with develop");
  assert.equal(describe({ behind: 9, ahead: 0, conflicts: false }), "nothing beyond develop (merged or empty); 9 behind develop");
  assert.equal(describe({ behind: 0, ahead: 1, conflicts: false, check: { install: true, typecheck: false, "offline tests": null } }),
    "up to date with develop; install passes; typecheck FAILS; offline tests not run");
  assert.match(table([{ branch: "variant/x", committedAt: now, behind: 0, ahead: 2, conflicts: false }]), /\| `variant\/x` \| 1970-04-11 \| 2 \| up to date with develop \|/);
});
