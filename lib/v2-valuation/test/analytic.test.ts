/**
 * The analytic calibration study's tools (docs/engine-v2/analytic-calibration.md). What would break: the cycle
 * diagnostic calling a symmetric mutator asymmetric (lib/v2-linear's potential test is the gate itself); the integers the exact sums
 * enumerate losing the Kraft identity (the outside mass is what makes their intervals rigorous).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mixedIntBits, q } from "@workspace/v2-core";
import { fromMC, lineType, lineZ } from "@workspace/v2-linear";
import { cycleDiagnostic } from "@workspace/v2-core";
import { integersWithin } from "../src/exact.ts";

test("cycle diagnostic on line-z: every mutator is symmetric (gen.nudge refuses a result it would have to divide through)", () => {
  const states = [];
  for (let m = -2; m <= 2; m++) for (let c = -2; c <= 2; c++) states.push({ lines: [fromMC(q(m), q(c))] });
  const r = cycleDiagnostic(lineType, lineZ, states, 12);
  for (const [id, s] of Object.entries(r.perMutator)) assert.equal(s.asymmetric, 0, id);
  assert.deepEqual(r.oneWay, {});
  assert.ok(r.perMutator["gen.nudge"]!.edges > 0);
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
