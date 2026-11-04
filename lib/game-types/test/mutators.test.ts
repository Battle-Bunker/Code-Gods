/**
 * applyCalls and the change cost (docs/energy-model.md §4): W = Σ each call's elementary decomposition, change = W + βW².
 * The owner's examples (3 Nov) are checked here: ×7 is cheap however many digits change; ×7⁴ costs more than 4 × (×7);
 * incrementing digit 3 costs less than ⅓ of incrementing digits 1, 3 and 5; a row costs more than 4 × a cell.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGE_BETA, GRID, INT, MAX_CALLS, STRING, availableOf, changeCost, seededRng } from "../src/index.ts";
import { applyCalls } from "../src/mutators.ts";
import { digitAddCost, multiplyCost, signedDigits } from "../src/int/index.ts";
import { gridElementaryCosts } from "../src/grid/index.ts";
import { stringElementaryCosts } from "../src/string/index.ts";

const close = (a: number, b: number, what = "") => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
/** The doc's worked examples, to their two decimals. */
const doc = (a: number, b: number, what = "") => assert.ok(Math.abs(a - b) < 0.006, `${what}: ${a} vs ${b}`);
const g4 = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" });
const red = (n: number) => Array.from({ length: n }, () => "0R").join(",");
/** A 4×4 board of 0s whose row 0 is red and the rest green: painting row 1 red changes exactly 4 colours. */
const BOARD = [red(4), ...Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => "0G").join(","))].join("/");
const act = (calls: unknown, value: string | number = BOARD, inst = g4, type: typeof GRID | typeof INT | typeof STRING = GRID) =>
  applyCalls(type as typeof GRID, inst, value, JSON.stringify(calls));
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

test("Int: a digit add and a prime multiply are elementary; ×7 is cheap; ×7⁴ > 4 × (×7); digit 3 < ⅓ of digits 1, 3 and 5", () => {
  const i32 = INT.instantiate({ min: -2147483648, max: 2147483647 });
  const run = (calls: unknown, x = 123456) => act(calls, x, i32, INT);
  close(digitAddCost(i32), 1 + Math.log2(10) + Math.log2(18), "digit add");
  close(multiplyCost(7), 2 + Math.log2(7) + 1, "×7");
  close(multiplyCost(2401), 2 + 4 * (Math.log2(7) + 1), "×7⁴ is four ×7 steps");
  const times7 = run([["multiply", { m: 7 }]]), times2401 = run([["multiply", { m: 2401 }]], 12);
  assert.ok(times7.ok && times2401.ok);
  doc(times7.cost.total, 7.49, "×7 (§4.4)");
  // ×7 changed several digits of 123456 (864192) and still costs only its own bits.
  assert.equal(times7.value, 864192);
  assert.ok(times2401.cost.total > 4 * times7.cost.total, `${times2401.cost.total} vs 4 × ${times7.cost.total}`);
  const digit3 = run([["add", { k: 100 }]]), digits135 = run([["add", { k: 10101 }]]);
  assert.ok(digit3.ok && digits135.ok);
  doc(digit3.cost.total, 12.10, "digit 3 (§4.4)");
  assert.ok(digit3.cost.total < digits135.cost.total / 3, `${digit3.cost.total} vs ⅓ of ${digits135.cost.total}`);
  // add is composite: +999 is two digit adds (+1000, −1); set_digit is one.
  assert.equal(signedDigits(999), 2);
  close(run([["add", { k: 999 }]]).cost.work, 2 * digitAddCost(i32), "+999");
  close(run([["set_digit", { place: 0, digit: 0 }]]).cost.work, digitAddCost(i32), "one digit set is one digit add");
  // A composite call that turns out to be a multiplication is priced as the cheaper: 1200 + 1200 is one digit add (+1000)?
  // No, two (+1000, +200); as ×2 it is cheaper still.
  close(run([["add", { k: 1200 }]], 1200).cost.work, multiplyCost(2), "the cheaper decomposition");
  for (const [n, k] of [[0, 0], [6, 1], [9, 1], [10, 1], [99, 2], [999, 2], [1001, 2], [9999, 2], [-56, 2], [1095, 3]] as const)
    assert.equal(signedDigits(n), k, `fewest digit adds for ${n}`);
  // There is no "set the number" mutator.
  assert.equal(INT.mutators.some(m => m.id === "set"), false);
  assert.ok(!run([["set", { value: 7 }]]).ok);
  // Multiply refuses 0, 1 and −1, and fails out of range.
  for (const m of [0, 1, -1]) assert.ok(!run([["multiply", { m }]]).ok);
  assert.ok(!run([["multiply", { m: 1000000 }]]).ok);
});

test("string: set, insert and delete are elementary; an edit script prices the rest", () => {
  const s16 = STRING.instantiate({ maxLength: 16 }), w = stringElementaryCosts(s16);
  const run = (calls: unknown, x = "hello") => act(calls, x, s16, STRING);
  close(run([["set_char", { i: 0, c: "j" }]]).cost.work, w.set, "one character");
  close(run([["insert", { i: 5, text: "!!" }]]).cost.work, 2 * w.insert, "two inserts");
  close(run([["reverse", {}]]).cost.work, 4 * w.set, "hello → olleh: the middle l stays");
});

test("a call that changes nothing adds nothing; a change undone in the same act still paid for both steps", () => {
  const i4 = INT.instantiate({ min: 0, max: 9999 });
  const there = act([["add", { k: 1 }], ["add", { k: -1 }], ["add", { k: 10 }]], 1234, i4, INT);
  const direct = act([["add", { k: 10 }]], 1234, i4, INT);
  assert.ok(there.ok && direct.ok && there.value === direct.value);
  close(there.cost.work, 3 * digitAddCost(i4), "three steps");
  const back = act([["add", { k: 1 }], ["add", { k: -1 }]], 1234, i4, INT);
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
  assert.equal(availableOf(INT.mutators, INT.instantiate({ min: 3, max: 3 })).length, 0);
  assert.ok(!applyCalls(INT, INT.instantiate({ min: 3, max: 3 }), 3, '[["add",{"k":1}]]').ok);
});
