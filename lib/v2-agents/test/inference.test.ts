/**
 * Rival inference (v1's fit_utility_mixture, restored under the coordinator's call 36; archive lib/game-utilities/src/
 * inference.ts): which rules do the OTHER players hold, from the others' summed bits a player has seen? Hypotheses are
 * sets of k candidate rules of different families (the dealer never seats a family twice), scored by a Gaussian
 * likelihood at the game's noise and the dealer's prior (a uniform family, then uniform parameters) times hint odds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitRules, nnls, type FitCandidate } from "../src/inference.ts";

/** A deterministic unit stream and a standard normal from it. */
const lcg = (seed: number) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const gauss = (u: () => number) => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());

/** Five families, two parameter sets each; each candidate's bits at 60 observed states are distinct-looking curves. */
function world(n = 60) {
  const u = lcg(11), cands: FitCandidate[] = [];
  for (const family of ["a", "b", "c", "d", "e"]) for (const p of [1, 2]) cands.push({ family, params: { p }, tieBreaker: null, bits: Array.from({ length: n }, () => 8 * u()) });
  return cands;
}

test("exact sums identify the others' rules at once, and say so", () => {
  const cands = world(), truth = [cands[2]!, cands[7]!];   // b{p:1} and d{p:2}
  const y = truth[0]!.bits.map((x, i) => x + truth[1]!.bits[i]!);
  const fit = fitRules({ y, candidates: cands, others: 2, sigma: 0 });
  const best = fit.hypotheses[0]!;
  assert.deepEqual(best.rules.map(r => `${r.family}${(r.params as { p: number }).p}`).sort(), ["b1", "d2"]);
  assert.ok(best.posterior > 0.99 && fit.exact, `posterior ${best.posterior}`);
  assert.ok(fit.families.b! > 0.99 && fit.families.d! > 0.99 && fit.families.a! < 0.01);
});

test("at σ 8 a handful of values does not pin the set; many values do", () => {
  const cands = world(400), truth = [cands[0]!, cands[5]!];
  const u = lcg(5), noise = Array.from({ length: 400 }, () => 8 * gauss(u));
  const y = truth[0]!.bits.map((x, i) => x + truth[1]!.bits[i]! + noise[i]!);
  const few = fitRules({ y: y.slice(0, 5), candidates: cands.map(c => ({ ...c, bits: c.bits.slice(0, 5) })), others: 2, sigma: 8 });
  assert.ok(few.hypotheses[0]!.posterior < 0.5, `5 values: top posterior ${few.hypotheses[0]!.posterior}`);
  const many = fitRules({ y, candidates: cands, others: 2, sigma: 8 });
  assert.deepEqual(many.hypotheses[0]!.rules.map(r => r.family).sort(), ["a", "c"]);
});

test("a hint raises its family; an excluded family is never proposed; no family appears twice in a hypothesis", () => {
  const cands = world(30), truth = [cands[0]!, cands[5]!];
  const u = lcg(9), y = truth[0]!.bits.map((x, i) => x + truth[1]!.bits[i]! + 8 * gauss(u));
  const plain = fitRules({ y, candidates: cands, others: 2, sigma: 8 });
  const hinted = fitRules({ y, candidates: cands, others: 2, sigma: 8, hints: [{ family: "e", probability: 0.9 }] });
  assert.ok(hinted.families.e! > plain.families.e!);
  const ex = fitRules({ y, candidates: cands, others: 2, sigma: 8, exclude: ["a"] });
  assert.ok(ex.hypotheses.every(h => h.rules.every(r => r.family !== "a")));
  for (const h of plain.hypotheses) assert.equal(new Set(h.rules.map(r => r.family)).size, h.rules.length);
  assert.ok(Math.abs(plain.hypotheses.reduce((t, h) => t + h.posterior, 0) - 1) < 1e-9 || plain.hypotheses.length < 45);
});

test("the spectrum: non-negative least squares recovers a sum of columns", () => {
  const cols = [Float64Array.from([1, 0, 0, 1]), Float64Array.from([0, 1, 0, 1]), Float64Array.from([0, 0, 1, 1])];
  const w = nnls([2, 3, 0, 5], cols);
  assert.ok(Math.abs(w[0]! - 2) < 1e-6 && Math.abs(w[1]! - 3) < 1e-6 && w[2]! < 1e-6);
  assert.ok([...nnls([-1, -1, -1, -3], cols)].every(x => x >= 0), "never negative");
});
