/** The candidate rules (src/candidate-families.ts): worked utilities, never dealt, and candidates that reach their target. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Q } from "@workspace/v2-core";
import { archimedes, bearing, candidateFamilies, corner, dynamicFamilies, fromMC, goldenPath, hensel, kin, lineRule, longRun, primePalette, sharedSecret, wholeStair } from "../src/index.ts";

const u = (F: { dynamic?: unknown }, p: unknown, m: Q, c: Q) => (F as typeof bearing).dynamic!.u({ lines: [fromMC(m, c)] }, p as never);
const near = (a: number, b: number, what: string, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${what}: ${a} against ${b}`);

test("worked utilities", () => {
  near(u(bearing, { deg: 37 }, q(3, 4), q(1)), -Math.log2(Math.abs(0.75 - Math.tan((37 * Math.PI) / 180))), "3/4 against tan 37°");
  near(u(goldenPath, { word: "1" }, q(13, 8), q(1)), 4, "13/8 = [1; 1, 1, 1, 2]: four 1s");
  near(u(archimedes, { k: 2 }, q(17, 12), q(1)), Math.log2(17 * 17 + 2 * 144), "17² − 2·12² = 1");
  near(u(hensel, { k: 2, p: 7 }, q(3), q(1)), Math.log2(7), "3² − 2 = 7");
  near(u(wholeStair, { k: 1 }, q(3, 4), q(1)), Math.log2(5), "3, 4, 5");
  near(u(corner, { k: 5 }, q(1, 10), q(1)), Math.log2(10), "2·5·1·10 = 10²");
  near(u(primePalette, { primes: [3], on: "gradient top" }, q(9, 2), q(1)), 2 * Math.log2(3), "9 = 3²");
  near(u(longRun, { b: 7, d: 3, on: "y-intercept top" }, q(1), q(24)), Math.log2(7), "24 = 33 in base 7");
  near(u(kin, {}, q(3, 2), q(1)), 2 * Math.log2(3), "3·1 − 1·2 = 1");
  // a = xy, b = yz, c = zx with x, y, z = 3, 5, 2: 15x + 10y + 6 = 0 → gcds 5, 2, 3.
  near(u(sharedSecret, {}, q(-15, 10), q(-6, 10)), Math.log2(30), "15, 10, 6");
});

test("candidates are never dealt, and each one's candidates reach the utility asked for", () => {
  const dealt = new Set(dynamicFamilies.map(f => f.id));
  for (const F of candidateFamilies) {
    assert.ok(!dealt.has(F.id), `${F.id} must not be dealt`);
    const p = F.dealable({ params: { domain: "Q" } } as never)[0], r = lineRule(F.dynamic!, p);
    const hit = r.candidates(fromMC(q(3, 2), q(7, 3)), 6).filter(t => t.b !== 0n && r.u(t) >= 6 - 1e-9);
    assert.ok(hit.length > 0, `${F.id}: no candidate reaches 6`);
  }
});
