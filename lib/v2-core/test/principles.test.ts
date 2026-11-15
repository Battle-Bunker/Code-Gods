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

test("straightHill: a chain that keeps paying the same per fee fails; a chain whose gains shrink passes; a cap on the whole climb", async () => {
  const { straightHill } = await import("../src/principles.ts");
  const fees = Array.from({ length: 30 }, () => 12);
  const straight = Array.from({ length: 31 }, (_, i) => 3 + 0.9 * i);              // +0.9 bits a stretch, every time
  assert.match(straightHill(straight, fees)!, /straight hill/);
  const levels = Array.from({ length: 31 }, (_, i) => 3 + 4 * Math.sqrt(i));     // each level needs one more stretch
  assert.equal(straightHill(levels, fees), null);
  assert.equal(straightHill(Array.from({ length: 31 }, () => 5), fees), null, "a chain that gains nothing passes");
  const steep = Array.from({ length: 31 }, (_, i) => 3 + 20 * Math.sqrt(i));      // shrinking, but 110 bits in all
  assert.match(straightHill(steep, fees)!, /gains 109\.5 bits/);
});

test("driftParams never redraws a family that keeps its parameters (a ladder family)", async () => {
  const { driftParams } = await import("../src/drift.ts");
  const fam = { dealable: () => [{ k: 1 }, { k: 2 }, { k: 3 }], keepsParams: true };
  for (let tick = 1; tick <= 20; tick++) assert.deepEqual(driftParams(fam, {} as never, { k: 2 }, "s", 0, tick), { k: 2 });
  const free = { dealable: () => [{ k: 1 }, { k: 2 }, { k: 3 }] };
  assert.ok(Array.from({ length: 20 }, (_, t) => driftParams(free, {} as never, { k: 2 }, "s", 0, t + 1).k).some(k => k !== 2));
});
