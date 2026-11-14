/**
 * The analytic calibration study's tools (docs/engine-v2/analytic-calibration.md). What would break: the cycle
 * diagnostic missing the one asymmetric mutator, or calling a symmetric one asymmetric; the exact sums losing the
 * Kraft identity (the outside mass is what makes their intervals rigorous); a separable sum disagreeing with the
 * closed form for the simplest rung.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mixedIntBits, q } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, primeLanding } from "@workspace/v2-linear";
import { cycleDiagnostic } from "../src/cycles.ts";
import { exactRungsSeparable, integersWithin } from "../src/exact.ts";

test("cycle diagnostic on line-z: every mutator but gen.nudge is symmetric; nudge's renormalising branch is one-way", () => {
  const states = [];
  for (let m = -2; m <= 2; m++) for (let c = -2; c <= 2; c++) states.push({ lines: [fromMC(q(m), q(c))] });
  const r = cycleDiagnostic(lineType, lineZ, states, 12);
  for (const [id, s] of Object.entries(r.perMutator)) if (id !== "gen.nudge") assert.equal(s.asymmetric, 0, id);
  assert.deepEqual(Object.keys(r.oneWay), ["gen.nudge"]);
  assert.ok(r.perMutator["gen.nudge"]!.asymmetric > 0);
});

test("integersWithin: the cheapest integers, each once with its bits; their mass approaches 1 (Kraft equality)", () => {
  const ints = integersWithin(20);
  assert.equal(new Set(ints.map(x => x.n)).size, ints.length);
  for (const x of ints) assert.equal(x.bits, mixedIntBits(x.n));
  const mass = ints.reduce((a, x) => a + 2 ** -x.bits, 0);
  assert.ok(mass < 1 && mass > 0.998, String(mass));
  // Nothing within budget is missing: every |n| ≤ 50 with bits ≤ 20 is listed.
  for (let n = -50n; n <= 50n; n++) if (mixedIntBits(n) <= 20) assert.ok(ints.some(x => x.n === n), String(n));
});

test("exact separable sum: Prime Landing's 'c a prime ≥ 29' rung matches the closed form Σ over primes", () => {
  const r = exactRungsSeparable(primeLanding as never, {}, lineZ, "big-prime", ["c", "c"], 26);
  // c exactly a prime ≥ 29 (m free, its marginal sums to 1): the last-but-one rung of the joint ladder.
  let s = 0;
  for (const p of [29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]) s += 2 ** -mixedIntBits(BigInt(p));
  const closed = -Math.log2(s);
  const k = r.lo.length - 2;
  assert.ok(r.lo[k]! <= closed + 1e-6 && closed <= r.hi[k]! + 1e-3, `${r.lo[k]} ≤ ${closed} ≤ ${r.hi[k]}`);
  assert.ok(r.separableChecked > 0);
});
