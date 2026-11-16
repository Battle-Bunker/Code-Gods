/** Grids · big numbers (big-numbers.ts): the two tuple families' scores, cards and terms. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4 } from "../src/index.ts";
import { biggestFour, nearestPrimeEnding, primeBiggestFour, primeBiggestFourScore, primeRows, primeRowsScore, toPositiveMultiple, PRIME_ROWS_DEALT } from "../src/big-numbers.ts";
import { board } from "./helpers.ts";

const B131 = [119, 2, 6, 4, 3, 2, 1, 3, 6, 1, 0, 1, 3, 2, 2, 0];

test("the nearest prime ending in k: the smaller on a tie, and 11 for every small total", () => {
  assert.equal(nearestPrimeEnding(131, 1), 131);
  assert.equal(nearestPrimeEnding(135, 1), 131);
  assert.equal(nearestPrimeEnding(146, 1), 151, "141 = 3 × 47 is not prime: 146 is 15 from 131 and 5 from 151");
  assert.equal(nearestPrimeEnding(0, 1), 11);
  assert.equal(nearestPrimeEnding(0, 3), 3);
  assert.equal(nearestPrimeEnding(36, 1), 31, "31 and 41 are both 5 away: the smaller");
  const big = nearestPrimeEnding(1_000_000, 7);
  assert.equal(big % 10, 7);
  assert.ok(Math.abs(big - 1_000_000) < 100);
  assert.equal(toPositiveMultiple(0, 131), 131);
  assert.equal(toPositiveMultiple(250, 131), 12);
  assert.equal(toPositiveMultiple(270, 131), 8);
});

test("Prime Biggest Four reads the four biggest numbers, so no rearrangement changes its first two parts", () => {
  assert.deepEqual(biggestFour(B131), [0, 2, 3, 8]);
  const s = primeBiggestFourScore(B131, 4, 1);
  assert.deepEqual([s.total, s.prime, s.off], [119 + 6 + 4 + 6, 131, 4]);
  assert.deepEqual(s.thirds, { row: 0, column: 0, rest: 131 - (sum(B131) - 135) });
  // Every permutation keeps the total, the prime and the closeness.
  const shuffled = [...B131].reverse();
  const t = primeBiggestFourScore(shuffled, 4, 1);
  assert.deepEqual([t.total, t.prime, t.off], [s.total, s.prime, s.off]);
});

test("Prime Rows reads one edge; the cross is the line through the edge's biggest number", () => {
  const s = primeRowsScore(B131, 4, "top", 1);
  assert.deepEqual([s.total, s.prime, s.off], [131, 131, 0]);
  assert.equal(s.thirds.cross, 131 - (119 + 3 + 6 + 3), "the left column");
  assert.equal(s.thirds.opposite, 131 - (3 + 2 + 2 + 0));
  const l = primeRowsScore(B131, 4, "left", 1);
  assert.equal(l.total, 131, "the left column holds 119 + 3 + 6 + 3");
  assert.equal(l.thirds.cross, 0, "the top row through 119 adds up to 131");
  assert.equal(PRIME_ROWS_DEALT.length, 16);
});

test("the families evaluate on a board as the scores say, with every layer recorded and a tree valuation", () => {
  const b4 = primeBiggestFour(4), pr = primeRows(4);
  for (const f of [b4, pr]) assert.equal((f as { valuation?: string }).valuation, "tree");
  const s = board("9234", "0101", "8000", "7006");
  const terms = (f: typeof b4 | typeof pr, p: object) =>
    Object.fromEntries(evaluateSite(gridType, f as never, p, s, grid4, 0, "closeness>row").terms.map(t => [t.id, Number((t.value as Q).n)]));
  // Four biggest: 9 + 8 + 7 + 6 = 30 → 31, 1 off; the top row through 9 adds up to 18; the left column 24.
  assert.deepEqual(terms(b4, { ends: 1 }), { prime: 31, closeness: 1, row: 13, column: 7, rest: 20 });
  // The top row adds up to 18: 13 and 23 are both 5 away, so 13; the left column through 9 adds up to 24.
  const t = Object.fromEntries(evaluateSite(gridType, pr as never, { edge: "top", ends: 3 }, s, grid4, 0, "closeness>cross").terms.map(x => [x.id, Number((x.value as Q).n)]));
  assert.deepEqual(t, { prime: 13, closeness: 5, cross: 11, opposite: 13 - 13, rest: 3 }, "the other twelve add up to 23, 3 from 26");
});

test("the cards name the reading, the targets with examples, and what decides ties", () => {
  const b4 = primeBiggestFour(4), pr = primeRows(4);
  const c = b4.card({ ends: 1 }, "closeness>row");
  assert.match(c, /four biggest numbers on the board, wherever they are/);
  assert.match(c, /11, 31, 41, 61, 71, 101, 131/);
  assert.match(c, /halfway between two, take the smaller/);
  assert.match(c, /Secondary: The total should be as close as possible to that prime\. Third: The row holding the biggest number/);
  assert.match(pr.card({ edge: "left", ends: 7 }, "closeness>cross"), /left column.*ending in 7.*whole row through it/);
});

function sum(xs: readonly number[]) { return xs.reduce((t, x) => t + x, 0); }

// ---------------------------------------------------------------- the board

import { applyCall, isInvalid, variantMutators } from "@workspace/v2-core";
import { bigCellBits, bigGrid4, bigGridType, bigLog2Z, drawBigCell } from "../src/big-numbers-type.ts";

test("the big-numbers board: uncapped cells, a constant field per cell, wide cells encoded with commas", () => {
  const s = { cells: B131 };
  assert.equal(bigGridType.encode(s), "119,2,6,4/3,2,1,3/6,1,0,1/3,2,2,0");
  assert.deepEqual(bigGridType.decode("119,2,6,4/3,2,1,3/6,1,0,1/3,2,2,0"), s);
  assert.ok(Math.abs(bigLog2Z(bigGrid4) - -Math.log2(1 - 2 ** -0.25)) < 1e-12);
  assert.equal(bigCellBits(4, bigGrid4) - bigCellBits(0, bigGrid4), 1, "g = ¼ bit per unit");
  assert.ok(!isInvalid(bigGridType.canonical({ cells: [12345, ...Array(15).fill(0)] }, bigGrid4)));
  assert.ok(isInvalid(bigGridType.canonical({ cells: [-1, ...Array(15).fill(0)] }, bigGrid4)));
  // The law: P(v) = 2^−φ(v) sums to 1; the inverse draw gives v ≥ k with probability 2^(−k/4).
  let mass = 0; for (let x = 0; x < 400; x++) mass += 2 ** -bigCellBits(x, bigGrid4);
  assert.ok(Math.abs(mass - 1) < 1e-9);
  assert.equal(drawBigCell(bigGrid4, 0), 0);
  assert.equal(drawBigCell(bigGrid4, 1 - 2 ** -2), 8);
});

test("the grid's moves work on uncapped cells, and going up pays the field (the confining surcharge)", () => {
  const s = { cells: B131 };
  const ids = variantMutators(bigGridType, bigGrid4).map(m => m.id);
  assert.ok(ids.includes("cells.add") && ids.includes("cells.swap"));
  const up = applyCall(bigGridType, bigGrid4, s, { mutator: "cells.add", site: 0, args: { cell: "r0c0", k: "100" } });
  const down = applyCall(bigGridType, bigGrid4, s, { mutator: "cells.add", site: 0, args: { cell: "r0c0", k: "-100" } });
  if (isInvalid(up) || isInvalid(down)) assert.fail(JSON.stringify([up, down]));
  assert.equal(up.result.cells[0], 219);
  assert.equal(down.result.cells[0], 19);
  assert.ok(Math.abs(up.price.surcharge - 25) < 1e-9, "100 units up at ¼ bit each");
  assert.equal(down.price.surcharge, 0);
  const sw = applyCall(bigGridType, bigGrid4, s, { mutator: "cells.swap", site: 0, args: { a: "r0c0", b: "r3c3" } });
  if (isInvalid(sw)) assert.fail(sw.invalid);
  assert.ok(Math.abs(sw.price.surcharge) < 1e-9, "a rearrangement is level in the field");
});
