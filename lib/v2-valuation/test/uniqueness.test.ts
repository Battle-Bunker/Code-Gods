/**
 * The uniqueness correction (owner decision 24, spec §2.6). What would break: a correction that is not monotone in the
 * score (a better score worth less), one applied with a single object, or a table that no longer measures the
 * restricted law (checked on a finite law, where E[M_N] has a closed form for N = 2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { q, type Score } from "@workspace/v2-core";
import { uniquenessShift, withUniqueness, type Lookup } from "../src/index.ts";

const table = (v: string) => JSON.parse(readFileSync(new URL(`../uniqueness/${v}.json`, import.meta.url), "utf8"));

test("no correction for one object; it grows with the number of objects; grids are unaffected", () => {
  const z = table("line-z");
  assert.equal(uniquenessShift(z, 1), 0);
  let prev = 0;
  for (const n of [2, 4, 10, 40, 100, 1000]) { const s = uniquenessShift(z, n); assert.ok(s >= prev - 1e-9, `${n}`); prev = s; }
  assert.ok(uniquenessShift(z, 40) > 0.5 && uniquenessShift(z, 40) < 1, "line-z at 40 objects");
  assert.ok(uniquenessShift(table("grid-4-d10"), 1000) < 1e-6, "grids: Σπ² ≈ 1.5e−12, nothing to correct");
});

test("the corrected value stays monotone in the score, starts at the crowded region and reaches the full shift", () => {
  const z = table("line-z");
  const fake = (u: Score): Lookup => ({ bits: Number(u![0]!.n), lo: Number(u![0]!.n) - 0.1, hi: Number(u![0]!.n) + 0.1, at: "knot" });
  for (const n of [4, 40, 1000]) {
    const look = withUniqueness(fake, z, n), shift = uniquenessShift(z, n);
    let prev = -1;
    for (let b = 0; b <= 40; b++) {
      const v = look([q(b)]);
      assert.ok(v.bits >= prev - 1e-9, `N=${n}: monotone at ${b}`);
      assert.ok(v.lo <= v.bits && v.bits <= v.hi);
      prev = v.bits;
    }
    assert.equal(look([q(0)]).bits, 0);
    assert.ok(Math.abs(look([q(40)]).bits - (40 - shift)) < 1e-9, `N=${n}: full shift far out`);
  }
});

test("E[M_2] on line-z is Σπ² (two objects: the other holds a draw from π conditioned on differing)", () => {
  const z = table("line-z");
  // With N = 2 the other object holds x with probability ∝ π(x)(1 − π(x)), so E[M] = (Σπ² − Σπ³)/(1 − Σπ²) ≈ Σπ².
  assert.ok(Math.abs(z.heldMass[0] - z.collision) < 0.02, `${z.heldMass[0]} against Σπ² = ${z.collision}`);
});
