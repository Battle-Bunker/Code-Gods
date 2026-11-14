import { test } from "node:test";
import assert from "node:assert/strict";
import { isInvalid } from "@workspace/v2-core";
import { gridType, grid4, grid2, cellBits, log2Z } from "../src/index.ts";
import { board } from "./helpers.ts";

test("the wire is rows of digits joined by /, and only canonical boards decode", () => {
  const b = board("0120", "3001", "0000", "9000");
  assert.equal(gridType.encode(b), "0120/3001/0000/9000");
  assert.deepEqual(gridType.decode("0120/3001/0000/9000"), b);
  assert.throws(() => gridType.decode("012/3001/0000/9000"));
  assert.throws(() => gridType.decode("01a0/3001/0000/9000"));
});

test("canonical refuses a board of the wrong size or past the cap", () => {
  assert.ok(isInvalid(gridType.canonical({ cells: [0, 0, 0] }, grid4)));
  assert.ok(isInvalid(gridType.canonical({ cells: Array(16).fill(10) }, grid4)));
  assert.ok(isInvalid(gridType.canonical({ cells: [-1, ...Array(15).fill(0)] }, grid4)));
  assert.ok(!isInvalid(gridType.canonical(board("0120", "3001", "0000", "9000"), grid4)));
});

test("energy is half the board's total plus a constant per cell; the empty board is the centre", () => {
  const empty = gridType.origin(grid4);
  assert.deepEqual(empty.cells, Array(16).fill(0));
  assert.ok(Math.abs(gridType.readLength(empty, grid4) - 16 * log2Z(grid4)) < 1e-9);
  const b = board("0120", "3001", "0000", "9000");
  assert.ok(Math.abs(gridType.readLength(b, grid4) - gridType.readLength(empty, grid4) - 16 / 2) < 1e-9);
  assert.ok(Math.abs(log2Z(grid4) - 1.7257) < 1e-3);
  assert.ok(Math.abs(cellBits(9, grid4) - 6.2257) < 1e-3);
});

test("the cell code is complete: 2^−φ sums to exactly 1 over every board of the 2×2 test variant", () => {
  let total = 0, n = 0;
  for (let i = 0; i < 81; i++) {
    const cells = [0, 1, 2, 3].map(k => Math.floor(i / 3 ** k) % 3);
    total += 2 ** -gridType.readLength({ cells }, grid2);
    n++;
  }
  assert.equal(n, 81);
  assert.ok(Math.abs(total - 1) < 1e-12, String(total));
});
