/**
 * applyCalls and the change cost (docs/energy-model.md §4): W = Σ each call's elementary decomposition, change = W + βW².
 * The owner's example (3 Nov) is checked here: a row costs more than 4 × a cell.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGE_BETA, GRID, MAX_CALLS, changeCost, seededRng } from "../src/index.ts";
import { applyCalls } from "../src/mutators.ts";
import { gridElementaryCosts } from "../src/grid/index.ts";

const close = (a: number, b: number, what = "") => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
/** The doc's worked examples, to their two decimals. */
const doc = (a: number, b: number, what = "") => assert.ok(Math.abs(a - b) < 0.006, `${what}: ${a} vs ${b}`);
const g4 = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" });
const red = (n: number) => Array.from({ length: n }, () => "0R").join(",");
/** A 4×4 board of 0s whose row 0 is red and the rest green: painting row 1 red changes exactly 4 colours. */
const BOARD = [red(4), ...Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => "0G").join(","))].join("/");
const act = (calls: unknown, value: string = BOARD, inst = g4) => applyCalls(GRID, inst, value, JSON.stringify(calls));
const CELL = (r: number, c: number) => ["paint", { kind: "cell", region: [r, c], colour: 0 }];
const ROW = (r: number) => ["paint", { kind: "line", region: [0, r], colour: 0 }];

test("β = 0.05: change = W + βW²", () => {
  assert.equal(CHANGE_BETA, 0.05);
  close(changeCost(20), 40, "the quadratic equals the linear at 1/β = 20 bits");
  assert.equal(changeCost(0), 0);
});

test("Grid: elementary costs, and any mutator is priced by the cells it changed", () => {
  const w = gridElementaryCosts(g4);
  close(w.colour, 1 + 4 + 2 * Math.log2(3), "set a colour");
  close(w.symbol, 1 + 4 + 2 * Math.log2(10), "set a symbol");
  const cell = act([CELL(1, 0)]);
  assert.ok(cell.ok);
  close(cell.cost.work, w.colour, "one cell");
  close(cell.cost.total, changeCost(w.colour), "one cell");
  doc(cell.cost.total, 11.51, "docs/energy-model.md §4.4");
  const row = act([ROW(1)]);
  assert.ok(row.ok);
  close(row.cost.work, 4 * w.colour, "a row is four sets");
  // Owner: a row costs more than 4 × a cell (7.5×, §4.4).
  assert.ok(row.cost.total > 4 * cell.cost.total);
  doc(row.cost.total / cell.cost.total, 7.48, "row / cell");
  // The same four cells in one act cost the same as the row; spread over four acts, a quarter of the quadratic each.
  const byHand = act([0, 1, 2, 3].map(c => CELL(1, c)));
  assert.ok(byHand.ok && byHand.value === row.value);
  close(byHand.cost.total, row.cost.total, "the act's W is what is quadratic, however it is split into calls");
  // A cell already red costs nothing to paint: painting row 0 changes nothing, so the act fails.
  const noop = act([ROW(0)]);
  assert.ok(!noop.ok && noop.reason === "no change" && noop.cost.total === 0);
});

test("a call that changes nothing adds nothing; a change undone in the same act still paid for both steps", () => {
  const green = (r: number, c: number) => ["paint", { kind: "cell", region: [r, c], colour: 1 }];
  const there = act([CELL(1, 0), green(1, 0), CELL(1, 1)]), direct = act([CELL(1, 1)]);
  assert.ok(there.ok && direct.ok && there.value === direct.value);
  close(there.cost.work, 3 * gridElementaryCosts(g4).colour, "three steps");
  const back = act([CELL(1, 0), green(1, 0)]);
  assert.ok(!back.ok && back.reason === "no change" && back.cost.total === 0);
});

test("junk and failed acts change nothing and cost nothing here (they pay their reads)", () => {
  const junk: unknown[] = ["not json", "{}", '"x"', "[1]", '[["paint"]]', '[["paint", []]]', '[[1, {}]]', [["nope", {}]],
    [["paint", { kind: "line", region: [0, 9], colour: 0 }]], []];
  for (const j of junk) {
    const o = applyCalls(GRID, g4, BOARD, typeof j === "string" ? j : JSON.stringify(j));
    assert.ok(!o.ok, JSON.stringify(j).slice(0, 80));
    assert.deepEqual(o.cost, { work: 0, total: 0 });
  }
  assert.ok(!act(Array.from({ length: MAX_CALLS + 1 }, () => CELL(1, 0))).ok);
  // unavailable here: tally needs Numeral, blend needs Mixable
  const cards = GRID.instantiate({ size: 5, symbols: "cards", colours: "rgb" });
  const cg = GRID.codec(cards).encode(GRID.spawn(cards, seededRng(1)));
  for (const c of [["tally", { kind: "all", colour: 0 }], ["blend", { kind: "all", recipe: [1, 3, 2] }]]) {
    const o = applyCalls(GRID, cards, cg, JSON.stringify([c]));
    assert.ok(!o.ok && /not available/.test(o.reason), JSON.stringify(o));
  }
  assert.ok(!applyCalls(GRID, g4, "garbage", JSON.stringify([CELL(0, 0)])).ok);
});
