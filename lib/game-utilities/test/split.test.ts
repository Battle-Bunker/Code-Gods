/**
 * The split estimator (architecture.md §3.2, §9.2): a sampling table built as R replicate pieces and merged. What would
 * break: a split table that depends on where its pieces ran (not byte-deterministic from the key and the plan), a merge
 * that is not the probability average (the body would no longer be the single run's on all the spawns), a pooled
 * variance that is wrong, a merge that reads past a replicate's estimates, a plan of one that is not the single run, or
 * split tables outside the bands the single-run tables meet against the verified formulas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiateKey, analyticFor, type CalibrationBudget } from "../src/calibration.ts";
import { compareWithTable, tableViolations } from "../src/analytic-verify.ts";
import {
  DEFAULT_BUDGET, SMOKE_BUDGET, buildReplicate, buildTable, budgetFor, expectedEvaluations, maxReplicates, mergeCurves, mergeReplicates, planSplit,
  replicateBudget, replicateSeed, tableJson, type Curve, type ReplicateResult,
} from "../scripts/estimator.ts";

const grid = instantiateKey("Grid(4,base10,rgby)");
const close = (a: number, b: number, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a split build is byte-deterministic from the key and the plan, whether its pieces run in one process or apart", () => {
  const plan = { replicates: 3 }, budget: CalibrationBudget = { ...SMOKE_BUDGET, particles: 192 };
  const whole = tableJson(buildTable("snap", {}, grid, budget, { plan }).table);
  assert.equal(tableJson(buildTable("snap", {}, grid, budget, { plan }).table), whole);
  // As the engine runs it: each piece on its own, its result through JSON (a document), merged elsewhere, in any order.
  const pieces = [2, 0, 1].map(r => JSON.parse(JSON.stringify(buildReplicate("snap", {}, grid, budget, plan, r))) as ReplicateResult);
  const merged = mergeReplicates("snap", {}, grid, budget, plan, pieces);
  assert.equal(tableJson(merged), whole);
  assert.deepEqual(merged.estimator.split, { replicates: 3 });
  assert.deepEqual(merged.estimator.budget, budget, "the table records the whole budget, as a single run would");
  // Another plan is another estimate (different seeds and shares): the plan is part of what the bytes depend on.
  assert.notEqual(tableJson(buildTable("snap", {}, grid, budget, { plan: { replicates: 2 } }).table), whole);
  // A plan of one is the single run, byte for byte.
  assert.equal(tableJson(buildTable("snap", {}, grid, SMOKE_BUDGET, { plan: { replicates: 1 } }).table), tableJson(buildTable("snap", {}, grid, SMOKE_BUDGET).table));
  // Missing or foreign pieces are refused.
  assert.throws(() => mergeReplicates("snap", {}, grid, budget, plan, pieces.slice(0, 2)), /replicates 0\.\.2/);
});

test("replicate shares: spawns and particles add up to the budget, the body keeps its depth, seeds differ per replicate", () => {
  const plan = { replicates: 7 };
  const shares = Array.from({ length: 7 }, (_, r) => replicateBudget(DEFAULT_BUDGET, plan, r));
  assert.equal(shares.reduce((n, b) => n + b.nMc, 0), DEFAULT_BUDGET.nMc);
  assert.equal(shares.reduce((n, b) => n + b.particles, 0), DEFAULT_BUDGET.particles);
  for (const b of shares) close(Math.log2(b.nMc / b.minMcCount), Math.log2(DEFAULT_BUDGET.nMc / DEFAULT_BUDGET.minMcCount), 0.15);
  assert.equal(new Set(shares.map((_, r) => replicateSeed("ab".repeat(32), plan, r))).size, 7);
  assert.equal(replicateSeed("ab".repeat(32), { replicates: 1 }, 0), "ab".repeat(8), "the single run's seed is the key's prefix");
  assert.throws(() => buildReplicate("snap", {}, grid, DEFAULT_BUDGET, { replicates: maxReplicates(DEFAULT_BUDGET) + 1 }, 0), /outside 1\.\./);
});

// Hand-made replicate curves: [ordinal, log2 Ĝ, se bits].
const curve = (points: [number, number, number][], extinct = false, bodyTop: number | null = null): Curve => ({ points, mcLevels: 0, splitLevels: points.length, stoppedEarly: extinct, extinct, bodyTop });

test("the merge averages survival in probability, weighted by each replicate's share, with the step function between its points", () => {
  const a = { weight: 0.5, curve: curve([[0, 0, 0], [1, -1, 0.1], [2, -2, 0.1], [4, -4, 0.2]]) };
  const b = { weight: 0.5, curve: curve([[0, 0, 0], [1, -1.5, 0.1], [3, -3, 0.2], [5, -5, 0.3]]) };
  const m = mergeCurves([a, b]);
  // Bounded by the shallowest replicate that reached its target: a's top, 4.
  assert.deepEqual(m.points.map(p => p[0]), [0, 1, 2, 3, 4]);
  const at = (o: number) => m.points.find(p => p[0] === o)!;
  close(at(1)[1], Math.log2(0.5 * 2 ** -1 + 0.5 * 2 ** -1.5));
  // b has no point at 2: its estimate there is that of its next point, 3 (no particle lay between); a's at 3 is its 4's.
  close(at(2)[1], Math.log2(0.5 * 2 ** -2 + 0.5 * 2 ** -3));
  close(at(3)[1], Math.log2(0.5 * 2 ** -4 + 0.5 * 2 ** -3));
  // Pooled se: √(Σ (w Ĝ se)²) / Ĝ.
  const g = 0.5 * 2 ** -2 + 0.5 * 2 ** -3;
  close(at(2)[2], Math.sqrt((0.5 * 2 ** -2 * 0.1) ** 2 + (0.5 * 2 ** -3 * 0.2) ** 2) / g);
});

test("pooled variance: R equal replicates of se s merge to se s/√R; Monte Carlo counts merge to the single body on all the spawns", () => {
  const same = Array.from({ length: 4 }, () => ({ weight: 0.25, curve: curve([[0, 0, 0], [1, -3, 0.4]]) }));
  close(mergeCurves(same).points[1][2], 0.2);
  // Bodies of n_r spawns with c_r of them ≥ t: the merge is log2(Σ c_r / Σ n_r), exactly the pooled count.
  const n = [1000, 1000, 1001], c = [37, 52, 41];
  const bodies = n.map((nr, r) => ({ weight: nr / 3001, curve: curve([[0, 0, 0], [1, Math.log2(c[r] / nr), 0.1]], false, 1) }));
  const m = mergeCurves(bodies);
  close(m.points[1][1], Math.log2((37 + 52 + 41) / 3001));
  assert.equal(m.mcLevels, 2, "levels at or below every body top are Monte Carlo levels");
});

test("an extinct replicate counts as zero past its top; a finished one bounds the merge", () => {
  const extinct = { weight: 0.5, curve: curve([[0, 0, 0], [1, -2, 0.1]], true) };
  const finished = { weight: 0.5, curve: curve([[0, 0, 0], [1, -2, 0.1], [2, -6, 0.3], [3, -9, 0.4]]) };
  const m = mergeCurves([extinct, finished]);
  assert.deepEqual(m.points.map(p => p[0]), [0, 1, 2, 3]);
  close(m.points[2][1], Math.log2(0.5 * 2 ** -6), 1e-12);   // = −7: half the replicates went extinct below 2
  assert.equal(m.stoppedEarly, true);
  // All extinct: the deepest one bounds the merge.
  const both = mergeCurves([extinct, { weight: 0.5, curve: curve([[0, 0, 0], [2, -5, 0.2]], true) }]);
  assert.deepEqual(both.points.map(p => p[0]), [0, 1, 2]);
  close(both.points[2][1], Math.log2(0.5 * 2 ** -5));
});

test("the plan: a cheap table is one piece, an expensive one is split to the target piece time, never past the particles' bound", () => {
  const cost = (seconds: number) => ({ spawns: 1, proposals: 1, usPerSpawn: 1, usPerProposal: 1, seconds });
  assert.deepEqual(planSplit(cost(12), DEFAULT_BUDGET, 20), { replicates: 1 });
  assert.deepEqual(planSplit(cost(61), DEFAULT_BUDGET, 20), { replicates: 4 });
  assert.deepEqual(planSplit(cost(5000), DEFAULT_BUDGET, 20), { replicates: maxReplicates(DEFAULT_BUDGET) });
  // The expected work grows with the kernel (cells) and covers the replicate margin.
  const e4 = expectedEvaluations(grid, DEFAULT_BUDGET), e7 = expectedEvaluations(instantiateKey("Grid(7,base16,rgby)"), DEFAULT_BUDGET);
  assert.equal(e4.spawns, DEFAULT_BUDGET.nMc);
  assert.ok(e7.proposals > 3 * e4.proposals, `${e7.proposals} vs ${e4.proposals}`);
});

test("split tables meet the reference bands against verified formulas (default budget, the largest split the plan makes)", { timeout: 300_000 }, () => {
  const R = maxReplicates(DEFAULT_BUDGET), bad: string[] = [];
  // Cheap draws with deep tails whose formulas are exact (playbook.md), on a 4×4 grid.
  const draws: [string, Record<string, unknown>][] = [["hate_takeover", {}], ["hate_same_corners", {}], ["hate_value", { value: 0 }]];
  for (const [familyId, params] of draws) {
    const a = analyticFor(familyId, params, grid);
    assert.ok(a, `${familyId} has an analytic on ${grid.key}`);
    const t = buildTable(familyId, params, grid, budgetFor("Grid"), { exact: false, plan: { replicates: R } }).table;
    const c = compareWithTable(a, t);
    bad.push(...tableViolations(a, t, c).map(v => `${familyId}: ${v}`));
    for (const b of c.bands) if (b.band[1] <= 32 && b.levels >= 5 && b.rmsZ > 2) bad.push(`${familyId}: RMS z ${b.rmsZ.toFixed(2)} in ${b.band}`);
  }
  assert.deepEqual(bad, []);
});
