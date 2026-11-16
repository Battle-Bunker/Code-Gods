import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCode, applyCall, isInvalid, whichBits, type Call } from "@workspace/v2-core";
import { gridType, grid4 } from "../src/index.ts";
import { board, rowsOf } from "./helpers.ts";

const B = board("0120", "3001", "0000", "9000");
const run = (mutator: string, args: Record<string, string>, s = B) => {
  const r = applyCall(gridType, grid4, s, { mutator, site: 0, args } satisfies Call);
  if (isInvalid(r)) return r;
  return { rows: rowsOf(r.result), price: r.price };
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

test("cells.add adds to one cell and pays its size times a unit fee, plus half the growth", () => {
  const r = run("cells.add", { cell: "r0c0", k: "2" }) as { rows: string[]; price: { total: number; surcharge: number } };
  assert.deepEqual(r.rows, ["2120", "3001", "0000", "9000"]);
  assert.ok(near(r.price.surcharge, 1));
  // which (log2 13) and the cell (4 bits) are o; k = 2 is twice a unit move's whole fee rate(o) (far moves are dear).
  const rate = amountCode(whichBits(grid4, "cells.add") + 4, 1, false).rate;
  assert.ok(near(r.price.total, 2 * rate + 1), String(r.price.total));
  assert.ok(rate > whichBits(grid4, "cells.add") + 4 + 1 && rate < whichBits(grid4, "cells.add") + 4 + 1.01, String(rate));
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

test("every mutator describes its call in people's words (row 2, column 3), never an element name", () => {
  const say = (id: string, args: Record<string, string>) => {
    const m = gridType.mutators.find(x => x.id === id)!;
    return m.describe(m.args(grid4).decode(args));
  };
  assert.equal(say("cells.add", { cell: "r1c2", k: "1" }), "+1 in row 2, column 3");
  assert.equal(say("cells.swap", { a: "r0c0", b: "r3c3" }), "swap row 1, column 1 and row 4, column 4");
  assert.equal(say("tally.add", { line: "col0", k: "-2" }), "−2 in every cell of column 1");
  assert.equal(say("tally.rotate", { line: "row1", j: "2" }), "move row 2's numbers 2 places along");
  assert.equal(say("turn.balance", { pair: "pair1", k: "2" }), "+2 in row 1, column 2 and −2 in its opposite, row 4, column 3");
  assert.equal(say("mirror.reverse", { line: "row3" }), "write row 4 backwards");
  assert.equal(say("steps.tilt", { line: "row0", k: "1" }), "+1 on every step along row 1");
  assert.equal(say("boxes.add", { box: "box1", k: "1" }), "+1 in every cell of the top-right box");
});
