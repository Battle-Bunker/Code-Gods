/**
 * Rival inference (src/inference.ts, docs/public-log-design.md §4). What would break: a fit that does not recover an
 * exactly explained mixture, a hint that does not move the prior (or moves it the wrong way), identical columns
 * reported as separate rules, a candidate column that is not the engine's bits, or a family missing from the
 * candidates.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { instantiate, objectType, type ObjectValue } from "@workspace/game-types";
import { shippedTables } from "../src/calibration-data.ts";
import { evaluator, familiesFor, available, surprisal, tableFor, penaltyMeanBits } from "../src/index.ts";
import { softHinge } from "../src/calibration.ts";
import { candidateColumn, candidatesFor, fitMixture, logPriors, nnls, type Candidate } from "../src/inference.ts";

const c = (familyId: string, params: Record<string, number> = {}): Candidate => ({ familyId, params, role: "reward" });
const col = (...xs: number[]) => Float64Array.from(xs);

test("an exactly explained mixture of two rules is the top hypothesis, with zero residual", () => {
  // y = A + C on four values; B is a decoy that correlates with y.
  const A = col(1, 0, 2, 0), B = col(1, 1, 2, 1), C = col(0, 3, 0, 1);
  const y = [1, 3, 2, 1];
  const fit = fitMixture({ y, others: 2, columns: [{ candidate: c("a"), column: A }, { candidate: c("b"), column: B }, { candidate: c("c"), column: C }] });
  assert.deepEqual(fit.hypotheses[0].draws.map(d => d.familyId).sort(), ["a", "c"]);
  assert.equal(fit.hypotheses[0].rss, 0);
  assert.equal(fit.exact, true);
  assert.ok(fit.hypotheses[0].posterior > 0.99);
  assert.deepEqual(fit.families.slice(0, 2).map(f => f.familyId).sort(), ["a", "c"]);
});

test("two other gods holding the same rule is a hypothesis too (a multiset)", () => {
  const A = col(1, 2, 0), B = col(0, 1, 1);
  const fit = fitMixture({ y: [2, 4, 0], others: 2, columns: [{ candidate: c("a"), column: A }, { candidate: c("b"), column: B }] });
  assert.deepEqual(fit.hypotheses[0].draws.map(d => d.familyId), ["a", "a"]);
});

test("identical columns are one class: the data cannot tell them apart, and the report says so", () => {
  const A = col(1, 2, 3);
  const fit = fitMixture({ y: [1, 2, 3], others: 1, columns: [{ candidate: c("a", { k: 1 }), column: A }, { candidate: c("a", { k: 2 }), column: Float64Array.from(A) }] });
  assert.equal(fit.distinct, 1);
  assert.deepEqual(fit.hypotheses[0].draws[0].aliases, [{ familyId: "a", params: { k: 2 } }]);
  assert.equal(fit.hypotheses[0].draws[0].aliasCount, 1);
});

test("the default prior is the dealer's: a uniform family, then a uniform parameter set; a hint moves its family's mass to p", () => {
  const cands = [c("a", { k: 1 }), c("a", { k: 2 }), c("b")];
  const p = logPriors(cands).map(Math.exp);
  assert.deepEqual([...p].map(x => +x.toFixed(6)), [0.25, 0.25, 0.5], "½ per family, then ½ per parameter set of a");
  const hinted = logPriors(cands, [{ familyId: "b", probability: 0.9 }]).map(Math.exp);
  // Odds of b against the rest: 0.9 / 0.1 = 9; the rest keeps its proportions: a1 = a2 = 1/20 of 1 + 9 … normalised later.
  assert.ok(Math.abs(hinted[2] / (hinted[0] + hinted[1]) - 9) < 1e-9);
  assert.ok(Math.abs(hinted[0] - hinted[1]) < 1e-12);
  const partial = logPriors(cands, [{ familyId: "a", params: { k: 2 }, probability: 0.8 }]).map(Math.exp);
  assert.ok(Math.abs(partial[1] / (partial[0] + partial[2]) - 4) < 1e-9, "a partial params hint matches only the agreeing draw");
});

test("a hint decides between hypotheses the data cannot separate, and data overrules a wrong hint", () => {
  const A = col(1, 1), B = col(2, 2);
  // y = A on both values: B cannot fit; with A and A' identical-but-separate families the hint picks.
  const cols = [{ candidate: c("a"), column: A }, { candidate: c("alias"), column: col(1, 1.0000000001) }, { candidate: c("b"), column: B }];
  const toward = (familyId: string) => fitMixture({ y: [1, 1], others: 1, columns: cols, hints: [{ familyId, probability: 0.95 }] }).hypotheses[0].draws[0].familyId;
  assert.equal(toward("alias"), "alias");
  assert.equal(toward("a"), "a");
  assert.notEqual(toward("b"), "b", "a hint for a rule that cannot explain the data loses");
});

test("the spectrum is a non-negative least-squares fit", () => {
  const w = nnls([3, 1], [col(1, 0), col(0, 1), col(1, 1)]);
  const fitted = [w[0] + w[2], w[1] + w[2]];
  assert.ok(Math.abs(fitted[0] - 3) < 1e-6 && Math.abs(fitted[1] - 1) < 1e-6);
  assert.ok([...w].every(x => x >= 0));
});

test("candidates are every available family's whole support, and a column is the engine's bits (reward and defence)", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgby" });
  const all = candidatesFor(inst, { defenceGoals: true });
  for (const role of ["reward", "penalty"] as const) {
    const fams = familiesFor("Grid", role).filter(f => available(f, inst).ok);
    assert.deepEqual(new Set(all.filter(x => x.role === role).map(x => x.familyId)), new Set(fams.map(f => f.id)), `every available ${role} family`);
  }
  assert.ok(!candidatesFor(inst, { exclude: ["bullseye"] }).some(x => x.familyId === "bullseye"), "excluded families are not candidates");
  assert.ok(!candidatesFor(inst).some(x => x.role === "penalty"), "no defence goals unless the game deals them");
  const tables = shippedTables(inst.key), T = objectType("Grid"), codec = T.codec(inst);
  let seed = 7; const rng = { int: (b: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % b, big: (b: bigint) => BigInt(rng.int(Number(b))) };
  const values = Array.from({ length: 5 }, () => codec.encode(T.spawn(inst, rng)) as ObjectValue);
  const reward = all.find(x => x.role === "reward")!, penalty = all.find(x => x.role === "penalty")!;
  const r = candidateColumn(reward, values, tables, inst, 1)!;
  values.forEach((v, t) => assert.equal(r[t], surprisal(tableFor(tables, reward, inst)!, evaluator(reward, inst)(v))));
  // n = s⁺ − w (h − E h): the defence goal's column is −w (softHinge(s) − mean), here with w = 2.
  const p = candidateColumn(penalty, values, tables, inst, 2)!, pt = tableFor(tables, penalty, inst)!;
  values.forEach((v, t) => assert.ok(Math.abs(p[t] - -2 * (softHinge(surprisal(pt, evaluator(penalty, inst)(v))) - penaltyMeanBits(pt))) < 1e-12));
});
