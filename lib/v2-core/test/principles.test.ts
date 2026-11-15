/** The design-principles check's mechanical rows (src/principles.ts). Breaks caught: a bounded main passing, an independent tie-breaker passing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { enoughInstances, mainUnbounded, tieEntangled, type Reading } from "../src/index.ts";

const r = (key: [number, number], main: number | null, t: number | null): Reading<[number, number]> => ({ key, main, ties: { t } });

test("row 1: a best still rising at the widest radius is unbounded (a sparse ladder may pause); a final plateau or a distance reaching 0 is not", () => {
  assert.equal(mainUnbounded("max", [[r([0, 1], 1, 0)], [r([0, 3], 3, 0)], [r([0, 9], 9, 0)]]).ok, true);
  assert.equal(mainUnbounded("max", [[r([0, 1], 1, 0)], [r([0, 3], 3, 0)], [r([0, 4], 3, 0)], [r([0, 9], 6, 0)]]).ok, true);
  assert.equal(mainUnbounded("max", [[r([0, 1], 1, 0)], [r([0, 3], 3, 0)], [r([0, 4], 3, 0)]]).ok, false);
  assert.equal(mainUnbounded("min", [[r([0, 1], 2, 0)], [r([0, 3], 0, 0)]]).ok, false);
});

test("row 3: a tie-breaker read from the main part's value restarts; one on another coordinate does not", () => {
  // Entangled: the tie-breaker is gcd(main − 1, m); on main 17, m = 16 is best; on main 37, m = 36.
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const lvl = (c: number, f: (m: number) => number) => Array.from({ length: 40 }, (_, m) => r([m + 1, c], c, f(m + 1)));
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0];
  assert.equal(tieEntangled(lvl(17, m => g(16, m)), lvl(37, m => g(36, m)), "t", same).ok, true);
  // Independent: the tie-breaker is m's own size, whatever the main part.
  assert.equal(tieEntangled(lvl(17, m => m), lvl(37, m => m), "t", same).ok, false);
});

test("row 4: four instances", () => {
  assert.equal(enoughInstances([1, 2, 3, 4]), true);
  assert.equal(enoughInstances([1, 2]), false);
});
