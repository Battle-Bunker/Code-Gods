/**
 * v1's grid moves restored on v2 (swap_lines, turn_block, swap_symbols, and add's ring and whole-board areas). The
 * rearranging moves are shortcuts in another representation (owner decision 25): priced as choices, the same whatever
 * the board holds. The ring add moves an amount: its fee is in proportion to |k| (decision 17), plus the confining
 * surcharge (decision 11).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountCode, applyCall, isInvalid, whichBits, type Call } from "@workspace/v2-core";
import { gridType, grid4 } from "../src/index.ts";
import { board, rowsOf } from "./helpers.ts";

const B = board("0120", "3001", "0000", "9000");
type Ok = { rows: string[]; price: { total: number; surcharge: number; arg: number; which: number } };
const run = (mutator: string, args: Record<string, string>, s = B) => {
  const r = applyCall(gridType, grid4, s, { mutator, site: 0, args } satisfies Call);
  if (isInvalid(r)) return r;
  return { rows: rowsOf(r.result), price: r.price, result: r.result };
};
const ok = (x: ReturnType<typeof run>) => { assert.ok(!isInvalid(x), JSON.stringify(x)); return x as Ok & { result: typeof B }; };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const which = (id: string) => whichBits(grid4, id);
const say = (id: string, args: Record<string, string>) => {
  const m = gridType.mutators.find(x => x.id === id)!;
  return m.describe(m.args(grid4).decode(args));
};
/** Apply a call, then its declared inverse, and check the board is back. */
const undoes = (id: string, args: Record<string, string>, s = B) => {
  const m = gridType.mutators.find(x => x.id === id)!;
  const a = m.args(grid4).decode(args);
  const there = ok(run(id, args, s));
  const inv = m.inverse.kind === "self" ? { id, args: a } : m.inverse.kind === "mutator" ? { id: m.inverse.id, args: m.inverse.args(a as never, grid4) } : null;
  assert.ok(inv, `${id} has an inverse`);
  const back = ok(run(inv.id, m.args(grid4).encode(inv.args as never) as Record<string, string>, there.result));
  assert.deepEqual(back.rows, rowsOf(s), `${id} ${JSON.stringify(args)} then its inverse`);
};

test("tally.swap swaps two rows or two columns (v1 swap_lines)", () => {
  assert.deepEqual(ok(run("tally.swap", { a: "row0", b: "row3" })).rows, ["9000", "3001", "0000", "0120"]);
  assert.deepEqual(ok(run("tally.swap", { a: "col0", b: "col2" })).rows, ["2100", "0031", "0000", "0090"]);
  assert.ok(isInvalid(run("tally.swap", { a: "row0", b: "col0" })), "a row with a column");
  assert.ok(isInvalid(run("tally.swap", { a: "row1", b: "row1" })), "a line with itself");
  assert.ok(isInvalid(run("tally.swap", { a: "row1", b: "row2" }, board("0000", "0000", "0000", "0000"))), "nothing changes");
  undoes("tally.swap", { a: "row1", b: "row3" });
  assert.equal(say("tally.swap", { a: "col1", b: "col3" }), "swap column 2 and column 4");
});

test("tally.swap is a shortcut: a flat price of two line choices, whatever the rows hold, no surcharge", () => {
  const small = ok(run("tally.swap", { a: "row0", b: "row1" }));
  const big = ok(run("tally.swap", { a: "row0", b: "row1" }, board("9999", "0000", "0000", "0000")));
  assert.ok(near(small.price.total, which("tally.swap") + 6) && near(big.price.total, small.price.total));
  assert.equal(big.price.surcharge, 0);
});

test("windows.turn turns or flips any 2×2 square, not only the corner boxes (v1 turn_block)", () => {
  // w0 is the square at the top-left corner; w4 is the centre square (rows 2–3, columns 2–3).
  assert.deepEqual(ok(run("windows.turn", { square: "w0", how: "quarter" })).rows, ["3020", "0101", "0000", "9000"]);
  assert.deepEqual(ok(run("windows.turn", { square: "w1", how: "flip-columns" })).rows, ["0210", "3001", "0000", "9000"]);
  const C = board("0000", "0120", "0340", "0000");
  assert.deepEqual(ok(run("windows.turn", { square: "w4", how: "half" }, C)).rows, ["0000", "0430", "0210", "0000"]);
  assert.deepEqual(ok(run("windows.turn", { square: "w4", how: "flip-diagonal" }, C)).rows, ["0000", "0130", "0240", "0000"]);
  for (const how of ["quarter", "three-quarters", "half", "flip-rows", "flip-columns", "flip-diagonal", "flip-antidiagonal"]) undoes("windows.turn", { square: "w4", how }, C);
  assert.ok(isInvalid(run("windows.turn", { square: "w8", how: "quarter" })), "an empty square does not change");
  assert.equal(say("windows.turn", { square: "w4", how: "quarter" }), "turn the 2×2 square whose top-left cell is row 2, column 2 a quarter turn clockwise");
});

test("windows.turn is a shortcut: square (log2 9) and turn (log2 7) as choices, no surcharge", () => {
  const r = ok(run("windows.turn", { square: "w4", how: "half" }, board("0000", "0190", "0090", "0000")));
  assert.ok(near(r.price.total, which("windows.turn") + Math.log2(9) + Math.log2(7)), String(r.price.total));
  assert.equal(r.price.surcharge, 0);
});

test("cells.trade trades every a for every b inside an area (v1 swap_symbols: a line, a square, a ring or the whole board)", () => {
  const T = board("1201", "0110", "2002", "1001");
  assert.deepEqual(ok(run("cells.trade", { area: "all", a: "0", b: "1" }, T)).rows, ["0210", "1001", "2112", "0110"]);
  assert.deepEqual(ok(run("cells.trade", { area: "row0", a: "1", b: "2" }, T)).rows, ["2102", "0110", "2002", "1001"]);
  assert.deepEqual(ok(run("cells.trade", { area: "col3", a: "1", b: "2" }, T)).rows, ["1202", "0110", "2001", "1002"]);
  assert.deepEqual(ok(run("cells.trade", { area: "outer", a: "0", b: "1" }, T)).rows, ["0210", "1111", "2002", "0110"]);
  assert.deepEqual(ok(run("cells.trade", { area: "centre", a: "0", b: "1" }, T)).rows, ["1201", "0000", "2112", "1001"]);
  assert.deepEqual(ok(run("cells.trade", { area: "w0", a: "0", b: "1" }, T)).rows, ["0201", "1010", "2002", "1001"]);
  assert.deepEqual(ok(run("cells.trade", { area: "big3", a: "0", b: "2" }, T)).rows, ["1201", "0112", "2220", "1221"]);
  assert.ok(isInvalid(run("cells.trade", { area: "row1", a: "3", b: "3" }, T)), "a number with itself");
  assert.ok(isInvalid(run("cells.trade", { area: "row1", a: "5", b: "7" }, T)), "neither number is there");
  undoes("cells.trade", { area: "all", a: "0", b: "9" });
  undoes("cells.trade", { area: "w4", a: "1", b: "2" }, T);
  assert.equal(say("cells.trade", { area: "row0", a: "3", b: "7" }), "every 3 becomes 7 and every 7 becomes 3 in row 1");
  assert.equal(say("cells.trade", { area: "outer", a: "0", b: "1" }), "every 0 becomes 1 and every 1 becomes 0 in the outer ring");
});

test("cells.trade is a shortcut: area and two numbers as choices, whatever the count traded; only the surcharge grows", () => {
  const areas = gridType.mutators.find(x => x.id === "cells.trade")!.argHelp!(grid4).area!.choices!;
  assert.equal(Object.keys(areas).length, 24, "8 lines, 9 small squares, 4 big squares, 2 rings, the whole board");
  const fee = which("cells.trade") + Math.log2(24) + 2 * Math.log2(10);
  const one = ok(run("cells.trade", { area: "all", a: "0", b: "9" }, board("0999", "9999", "9999", "9999")));
  const many = ok(run("cells.trade", { area: "all", a: "0", b: "9" }, board("0000", "0000", "0000", "0009")));
  assert.ok(near(one.price.total - one.price.surcharge, fee) && near(many.price.total - many.price.surcharge, fee));
  assert.equal(one.price.surcharge, 0, "the total falls: no surcharge");
  assert.ok(near(many.price.surcharge, (15 * 9 - 9) / 2), "fifteen 0s become 9s, one 9 becomes 0: half the growth");
});

test("rings.add adds to every cell of the outer ring, the centre or the whole board (v1 add's ring and all)", () => {
  const R = board("0120", "3001", "0000", "8000");
  assert.deepEqual(ok(run("rings.add", { ring: "outer", k: "1" }, R)).rows, ["1231", "4002", "1001", "9111"]);
  assert.deepEqual(ok(run("rings.add", { ring: "centre", k: "2" }, R)).rows, ["0120", "3221", "0220", "8000"]);
  assert.deepEqual(ok(run("rings.add", { ring: "all", k: "1" }, R)).rows, ["1231", "4112", "1111", "9111"]);
  assert.ok(isInvalid(run("rings.add", { ring: "all", k: "2" }, R)), "8 + 2 is past the cap");
  assert.ok(isInvalid(run("rings.add", { ring: "outer", k: "-1" }, R)), "0 − 1 is below 0");
  undoes("rings.add", { ring: "centre", k: "3" }, R);
  undoes("rings.add", { ring: "all", k: "1" }, R);
  assert.equal(say("rings.add", { ring: "outer", k: "2" }), "+2 in every cell of the outer ring");
  assert.equal(say("rings.add", { ring: "all", k: "-1" }), "−1 in every cell of the board");
});

test("rings.add's fee is in proportion to |k| (a unit fee against which + the ring's choice), plus half the growth", () => {
  const R = board("0120", "3001", "0000", "4000");
  const rate = amountCode(which("rings.add") + Math.log2(3), 1, false).rate;
  for (const [ring, cells] of [["outer", 12], ["centre", 4], ["all", 16]] as const) for (const k of [1, 2, 5]) {
    const r = ok(run("rings.add", { ring, k: String(k) }, R));
    assert.ok(near(r.price.surcharge, (cells * k) / 2), `${ring} +${k}: surcharge ${r.price.surcharge}`);
    assert.ok(near(r.price.total - r.price.surcharge, k * rate), `${ring} +${k}: fee ${r.price.total - r.price.surcharge}`);
  }
  const down = ok(run("rings.add", { ring: "all", k: "-1" }, board("1111", "1111", "1111", "1111")));
  assert.ok(near(down.price.total, rate) && down.price.surcharge === 0, "taking away: the same fee, no surcharge");
});

test("every new move's arguments name their choices in people's words (the What-if picker)", () => {
  for (const id of ["tally.swap", "windows.turn", "cells.trade", "rings.add"]) {
    const m = gridType.mutators.find(x => x.id === id)!;
    const help = m.argHelp!(grid4);
    for (const [name, h] of Object.entries(help)) {
      if (name === "k") continue;
      assert.ok(h.choices && Object.keys(h.choices).length > 0, `${id}.${name} has choices`);
      for (const [v, words] of Object.entries(h.choices!)) assert.ok(!/^(r\d|row\d|col\d|w\d|big\d)/.test(words) && words !== v, `${id}.${name}=${v}: "${words}"`);
    }
  }
});
