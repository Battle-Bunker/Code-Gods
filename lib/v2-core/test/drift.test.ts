/** Parameter drift's redraw (src/drift.ts). Breaks caught: a redraw that never keeps the current params (a predictable flip on a two-value grid), is not
 * reproducible, or moves a family with one set. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { driftParams, type Variant } from "../src/index.ts";

const variant = { id: "v" } as Variant;
const five = { dealable: () => [{ A: 4 }, { A: 6 }, { A: 8 }, { A: 12 }, { A: 18 }] };

test("driftParams: uniform over all the dealable params (the current ones included), deterministic per (seed, seat, tick); one set or none stays", () => {
  const seen = new Map<number, number>();
  for (let tick = 1; tick <= 4000; tick++) {
    const p = driftParams(five, variant, { A: 6 }, "g", 0, tick);
    seen.set(p.A, (seen.get(p.A) ?? 0) + 1);
    assert.deepEqual(driftParams(five, variant, { A: 6 }, "g", 0, tick), p, "the same draw again");
  }
  assert.deepEqual([...seen.keys()].sort((a, b) => a - b), [4, 6, 8, 12, 18], "the current params may stay");
  for (const n of seen.values()) assert.ok(Math.abs(n - 800) < 110, `uniform: ${[...seen.entries()]}`);
  const draws = (seed: string, seat: number) => Array.from({ length: 20 }, (_, t) => driftParams(five, variant, { A: 4 }, seed, seat, t + 1).A).join();
  assert.notEqual(draws("g", 0), draws("g", 1), "seats draw apart");
  assert.notEqual(draws("g", 0), draws("h", 0), "games draw apart");
  assert.deepEqual(driftParams(five, variant, { A: 6 }, "g", 0, 1, p => p.A === 12), { A: 12 }, "only what `allowed` accepts");
  const one = { dealable: () => [{ T: 6 }] };
  assert.deepEqual(driftParams(one, variant, { T: 6 }, "g", 0, 1), { T: 6 });
  assert.deepEqual(driftParams({ dealable: () => [] as { T: number }[] }, variant, { T: 6 }, "g", 0, 1), { T: 6 });
});
