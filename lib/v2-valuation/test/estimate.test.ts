/**
 * The estimator against an exactly solvable price list: shift and tilt only. Both are priced the same both ways, so
 * with the read-length surcharge the walk satisfies detailed balance and π(m, c) ∝ 2^−φ exactly (φ the mixed code).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mixedIntBits } from "@workspace/v2-core";
import { lineType, lineZ, mMeetsC, primeGradient, wholeIntercept } from "@workspace/v2-linear";
import { estimate, irreducible } from "../src/estimate.ts";
import { stationary } from "../src/linalg.ts";
import { calibrate, bitsFor } from "../src/artefact.ts";
import { evaluateObject } from "@workspace/v2-core";

const reversible = { ...lineZ, id: "line-z-shift-tilt", mutators: ["si.shift", "si.tilt"] };

function exactMMeetsC(): number[] {
  const R = 600;
  let Z = 0;
  const byGap = new Map<number, number>();
  for (let m = -R; m <= R; m++) for (let c = -R; c <= R; c++) {
    const p = 2 ** -(mixedIntBits(BigInt(m)) + mixedIntBits(BigInt(c)));
    Z += p;
    const g = Math.abs(m - c);
    byGap.set(g, (byGap.get(g) ?? 0) + p);
  }
  return [13, 8, 5, 3, 2, 1, 0].map(d => {
    let s = 0;
    for (const [g, p] of byGap) if (g <= d) s += p;
    return -Math.log2(s / Z);
  });
}

test("the stationary vector of a small chain", () => {
  const w = stationary([[0.5, 0.5, 0], [0.25, 0.5, 0.25], [0, 0.5, 0.5]])!;
  assert.deepEqual(w.map(x => x.toFixed(4)), ["0.2500", "0.5000", "0.2500"]);
  assert.equal(irreducible([[1, 0], [0.5, 0.5]]), false);
  assert.equal(irreducible([[0.9, 0.1], [0.5, 0.5]]), true);
});

test("on a reversible price list the estimate matches the exact values within three errors", () => {
  const exact = exactMMeetsC();
  const e = estimate({ type: lineType, variant: reversible, family: mMeetsC, params: {}, tieBreaker: null, config: { computeBudget: 16_000_000, initialSamples: 2048 } });
  assert.notEqual(e.status, "unreachable");
  e.rungs.slice(1).forEach((r, i) => {
    assert.ok(Math.abs(r.bits - exact[i]!) <= 3 * r.error + 0.01, `rung ${i + 1}: ${r.bits.toFixed(3)} ± ${r.error.toFixed(3)} against ${exact[i]!.toFixed(3)}`);
  });
  assert.ok(e.reversibility < 0.03, `reversibility ${e.reversibility}`);
  // Equilibrated: no chain's rate into the next upper set moved between the halves of its samples.
  assert.ok(e.drift.some(d => d !== null));
  assert.ok(!e.reasons.some(r => /not equilibrated/.test(r)), e.reasons.join("; "));
});

test("the same seed gives the same artefact; values are non-decreasing up the ladder; lookup follows the ladder", () => {
  const cfg = { computeBudget: 400_000, replicates: 4, burnIn: 200 };
  const a = calibrate(lineType, lineZ, primeGradient, {}, { config: cfg }).artefact;
  const b = calibrate(lineType, lineZ, primeGradient, {}, { config: cfg }).artefact;
  assert.equal(a.contentHash, b.contentHash);
  const c = calibrate(lineType, lineZ, primeGradient, {}, { seed: "other", config: cfg }).artefact;
  assert.notEqual(a.contentHash, c.contentHash);
  for (let i = 1; i < a.rungs.length; i++) assert.ok(a.rungs[i]!.bits >= a.rungs[i - 1]!.bits - 1e-9);
  const at = (m: number, cc: number) => bitsFor(a, evaluateObject(lineType, primeGradient, {}, { lines: [{ a: BigInt(-m), b: 1n, c: BigInt(-cc) }] }, lineZ).score);
  const rungOf = (label: string) => a.rungs.find(r => r.label === label)!.bits;
  assert.equal(at(-40, 0), a.rungs[0]!.bits);                             // 42 from the nearest prime: below every rung
  assert.equal(at(4, 0), rungOf("gradient to a prime within 1"));
  assert.equal(at(5, 0), rungOf("gradient to a prime exactly; the prime at least 5"));   // prime: the tie-breaker at the top
  assert.equal(at(31, 0), a.rungs[a.rungs.length - 1]!.bits);             // the top of the whole ladder
  // The joint ladder: three tie-breaker rungs (primes 7, 17, 23) at each main level below the top, all ten (3 … 31) at it.
  assert.deepEqual(a.rungs.map(r => r.layer), [-1, 1, 1, 1, ...Array.from({ length: 6 }, () => [0, 1, 1, 1]).flat(), 0, ...Array(10).fill(1)]);
  assert.equal(at(4, 3), rungOf("gradient to a prime within 1"));        // a prime gradient's neighbour, no tie-breaker rung
  // Value follows the order: a better tie-breaker at the same main level is a higher rung, so never fewer bits.
  assert.equal(at(18, 0), rungOf("gradient to a prime within 1; the prime at least 17"));
  assert.ok(at(18, 0) >= at(4, 0));
});

test("a layer with too few distinct values where it counts makes the rule too coarse (owner decision 13)", () => {
  // On whole-number lines the y-intercept is always whole: Whole Intercept's primary takes one value.
  const e = estimate({ type: lineType, variant: lineZ, family: wholeIntercept, params: {}, config: { computeBudget: 300_000, replicates: 2, burnIn: 100 } });
  assert.equal(e.status, "too-coarse");
  assert.equal(e.distinctLevels[0], 1);
});

test("equilibration: seeded chains with no burn-in drift away from their seeds, and the check says so", () => {
  // Enumerated seeds sit far out (|c| up to 120) where the stationary law has little mass; with no burn-in the chains on
  // the upper rungs are still walking in from there during the first half of their samples.
  const cfg = { computeBudget: 3_000_000, burnIn: 0, initialSamples: 16, thin: 2 };
  const e = estimate({ type: lineType, variant: lineZ, family: primeGradient, params: {}, config: cfg });
  assert.ok(e.reasons.some(r => /chain not equilibrated/.test(r)), e.reasons.join("; "));
  assert.notEqual(e.status, "converged");
});
