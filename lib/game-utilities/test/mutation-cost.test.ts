/**
 * Mutation-cost prototypes (scripts/mutation-cost-lib.ts, docs/mutation-cost-design.md): the distances, the
 * Kraft-tight λ, the multiply / divide erasure tables, the conditions a cost function must satisfy, and the
 * cost-weighted climb on a hand-checkable rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCost, instantiate, objectType, type GridValue } from "@workspace/game-types";
import { givenRule, space } from "../scripts/rule-difficulty-lib.ts";
import {
  energyClimb, energyOf, floorDivideRow, kraftLambda, lee, leeModel, leeSpectrum, linearModel, log2Z, logModel, multiplyTable, setModel, unitWordLength,
} from "../scripts/mutation-cost-lib.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("Lee distance is the shorter way round", () => {
  assert.deepEqual([0, 1, 4, 5, 6, 9, -1, 11].map(k => lee(k, 10)), [0, 1, 4, 5, 4, 1, 1, 1]);
  assert.deepEqual(leeSpectrum(10), [1, 2, 3, 4, 5, 4, 3, 2, 1]);
});

test("the Kraft-tight λ makes the geometric code complete, with no constant", () => {
  for (const b of [6, 10, 12, 16]) {
    const lam = kraftLambda(leeSpectrum(b));
    close(leeSpectrum(b).reduce((s, d) => s + 2 ** (-lam * d), 0), 1);
    close(log2Z(leeSpectrum(b), lam), 0);
  }
  // On a long cycle it tends to log2 3: each further step is one of three equally likely continuations.
  close(kraftLambda(leeSpectrum(1001)), Math.log2(3), 1e-6);
  // Paying for one of 16 cells inside λ: 16 · 2 · Σ x^d = 1 → x ≈ 1/33, λ ≈ log2 33.
  close(kraftLambda(leeSpectrum(10), 1 / 16), 5.044, 1e-3);
});

const kraftFrom = (m: { cellW(x: number, y: number): number }, x: number, cells: number, b: number) => {
  let s = 0;
  for (let y = 0; y < b; y++) if (y !== x) s += cells * 2 ** -m.cellW(x, y);
  return s;
};

test("every candidate model but the diameter one is a code: Σ over (cell, target) of 2^−W ≤ 1, and W grows with distance", () => {
  const cells = 16, b = 10;
  // The diameter normalisation is not a code: its "bits" overstate what the moves carry (Kraft sum ≈ 3).
  assert.ok(kraftFrom(leeModel("lee-diameter", cells, b), 0, cells, b) > 2.9);
  for (const m of [setModel(cells, b), leeModel("lee-located", cells, b), leeModel("lee-proportional", cells, b), leeModel("lee-diameter", cells, b), logModel(cells, b), linearModel(cells, b)]) {
    if (m.id !== "lee-diameter") for (let x = 0; x < b; x++) {
      const kraft = kraftFrom(m, x, cells, b);
      assert.ok(kraft <= 1 + 1e-9, `${m.id} from ${x}: Kraft sum ${kraft}`);
    }
    // Monotone in distance and translation-invariant on the cycle (linear: on the line).
    const dist = m.id === "linear-located" ? (k: number) => k : (k: number) => lee(k, b);
    for (let k = 1; k < b - 1; k++) {
      if (dist(k + 1) > dist(k)) assert.ok(m.cellW(0, k + 1) >= m.cellW(0, k), `${m.id} not monotone at ${k}`);
    }
    if (m.id !== "linear-located") for (let x = 0; x < b; x++) close(m.cellW(x, (x + 3) % b), m.cellW(0, 3));
  }
  // The diameter-normalised model prices the farthest add at what naming a value costs (plus where).
  close(leeModel("lee-diameter", cells, b).cellW(0, 5), 4 + Math.log2(10));
});

test("the prototype's set and slider models are the shipped set-v1 and distance-v1 on the numbers-only board", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" }), G = objectType("Grid");
  const at = (x: number): GridValue => ({ size: 4, sym: new Uint8Array(16).fill(x, 0, 1), col: new Uint8Array(16) });
  for (const [model, id] of [[setModel(16, 10), "set-v1"], [linearModel(16, 10), "distance-v1"]] as const) {
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) if (x !== y) {
      close(model.cellW(x, y), G.callWork(at(x), at(y), { id: "", params: null }, inst, id));
      close(energyOf(model.cellW(x, y)), changeCost(model.cellW(x, y)));
    }
  }
  close(setModel(16, 10).cellW(3, 4), 4 + 2 * Math.log2(10));
  close(linearModel(16, 10).cellW(3, 6), 4 + 3 * kraftLambda([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k])));
});

test("multiplying mod 10 erases log2 gcd(m, 10) bits; the units are 1, 3, 7, 9 and 3 generates them", () => {
  const t = multiplyTable(10);
  assert.deepEqual(t.map(r => r.image), [1, 10, 5, 10, 5, 2, 5, 10, 5, 10]);
  close(t[0].erased, Math.log2(10));
  close(t[5].erased, Math.log2(5));
  close(t[2].erased, 1);
  assert.deepEqual(t.filter(r => r.unit).map(r => [r.m, r.inverse]), [[1, 1], [3, 7], [7, 3], [9, 9]]);
  assert.deepEqual([1, 3, 9, 7].map(u => unitWordLength(u, 3, 10)), [0, 1, 2, 3]);
  assert.equal(unitWordLength(2, 3, 10), Infinity);
});

test("floor division on 0..9 erases about log2 m bits", () => {
  assert.deepEqual(floorDivideRow(2, 10), { m: 2, image: 5, erasedMax: 1, erasedMean: 1 });
  const r = floorDivideRow(3, 10); // blocks {0,1,2} {3,4,5} {6,7,8} {9}
  assert.equal(r.image, 4);
  close(r.erasedMean, (9 * Math.log2(3)) / 10);
});

test("cost-weighted climb: priced by distance, the careful agent takes the near cells first and earns more per energy", () => {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), sp = space(inst, "symbol");
  const sevens = givenRule("sevens", g => g.sym.filter(s => s === 7).length, o => o as number, 16);
  const start: GridValue = { size: 4, sym: Uint8Array.from([6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 8]), col: new Uint8Array(16) };
  const model = leeModel("lee-located", 16, 10), budgets = [20, 1000];
  const careful = energyClimb(sevens, sp, start, model, budgets, "per-energy");
  const blind = energyClimb(sevens, sp, start, model, budgets, "steepest");
  assert.equal(careful.bitsAt[0], 2, "the two cells one step from 7 first (7.1 energy each)");
  assert.ok(blind.bitsAt[0] < careful.bitsAt[0], "the cost-blind agent spends its first moves on far cells");
  assert.equal(careful.bitsAt[1], 16);
  close(careful.spent, blind.spent, 1e-9); // each cell moved once, straight to 7, in either order
  // Under today's flat set price the two policies are the same agent.
  const flat = setModel(16, 10);
  assert.deepEqual(energyClimb(sevens, sp, start, flat, budgets, "per-energy").bitsAt, energyClimb(sevens, sp, start, flat, budgets, "steepest").bitsAt);
});
