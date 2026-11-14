import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, type Call } from "@workspace/v2-core";
import { gridType, grid4 } from "../src/index.ts";
import { board, rowsOf } from "./helpers.ts";

const B = board("0120", "3001", "0000", "9000");
const run = (mutator: string, args: Record<string, string>, s = B) => {
  const r = applyCall(gridType, grid4, s, { mutator, site: 0, args } satisfies Call);
  if (isInvalid(r)) return r;
  return { rows: rowsOf(r.result), price: r.price };
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

test("cells.add adds to one cell and pays steps plus half the growth", () => {
  const r = run("cells.add", { cell: "r0c0", k: "2" }) as { rows: string[]; price: { total: number; surcharge: number } };
  assert.deepEqual(r.rows, ["2120", "3001", "0000", "9000"]);
  assert.ok(near(r.price.surcharge, 1));
  assert.ok(near(r.price.total, Math.log2(9) + 4 + 3.27 + 1), String(r.price.total));
  assert.ok(isInvalid(run("cells.add", { cell: "r3c0", k: "1" })), "past the cap");
  assert.ok(isInvalid(run("cells.add", { cell: "r0c0", k: "-1" })), "below 0");
});

test("cells.swap swaps two cells at no energy", () => {
  const r = run("cells.swap", { a: "r0c1", b: "r3c0" }) as { rows: string[]; price: { surcharge: number } };
  assert.deepEqual(r.rows, ["0920", "3001", "0000", "1000"]);
  assert.equal(r.price.surcharge, 0);
  assert.ok(isInvalid(run("cells.swap", { a: "r1c1", b: "r2c2" })), "two 0s: nothing changes");
});

test("tally.add and tally.rotate work on a row or a column", () => {
  assert.deepEqual((run("tally.add", { line: "row2", k: "3" }) as { rows: string[] }).rows, ["0120", "3001", "3333", "9000"]);
  assert.deepEqual((run("tally.add", { line: "col3", k: "1" }) as { rows: string[] }).rows, ["0121", "3002", "0001", "9001"]);
  assert.deepEqual((run("tally.rotate", { line: "row0", j: "1" }) as { rows: string[] }).rows, ["0012", "3001", "0000", "9000"]);
  assert.deepEqual((run("tally.rotate", { line: "col0", j: "1" }) as { rows: string[] }).rows, ["9120", "0001", "3000", "0000"]);
});

test("turn.spin turns and flips the whole board", () => {
  assert.deepEqual((run("turn.spin", { how: "quarter" }) as { rows: string[] }).rows, ["9030", "0001", "0002", "0010"]);
  assert.deepEqual((run("turn.spin", { how: "half" }) as { rows: string[] }).rows, ["0009", "0000", "1003", "0210"]);
  assert.deepEqual((run("turn.spin", { how: "flip-columns" }) as { rows: string[] }).rows, ["0210", "1003", "0000", "0009"]);
  assert.deepEqual((run("turn.spin", { how: "flip-diagonal" }) as { rows: string[] }).rows, ["0309", "1000", "2000", "0100"]);
});

test("turn.balance keeps an opposite pair's total", () => {
  // pair0 is r0c0 with r3c3.
  assert.deepEqual((run("turn.balance", { pair: "pair0", k: "2" }, board("0120", "3001", "0000", "9004")) as { rows: string[] }).rows, ["2120", "3001", "0000", "9002"]);
});

test("mirror.reverse, steps.tilt and boxes.add", () => {
  assert.deepEqual((run("mirror.reverse", { line: "row0" }) as { rows: string[] }).rows, ["0210", "3001", "0000", "9000"]);
  assert.deepEqual((run("steps.tilt", { line: "row2", k: "2" }) as { rows: string[] }).rows, ["0120", "3001", "0246", "9000"]);
  assert.deepEqual((run("boxes.add", { box: "box1", k: "1" }) as { rows: string[] }).rows, ["0131", "3012", "0000", "9000"]);
});

test("arguments outside their code are refused", () => {
  assert.ok(isInvalid(run("cells.add", { cell: "r4c0", k: "1" })));
  assert.ok(isInvalid(run("cells.add", { cell: "r0c0", k: "0" })));
  assert.ok(isInvalid(run("tally.rotate", { line: "row0", j: "4" })));
});
