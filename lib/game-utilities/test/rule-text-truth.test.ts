/**
 * Rule text that must match what the program computes on the shipped boards (production-readiness audit, 2026-11-11):
 * each case is a sentence that was false of its scoring code on some shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";

const even = context(instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }));
const odd = context(instantiate("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }));
const say = (id: string, params: object, ctx = even) => family(id).summary(params as never, ctx);

test("a quarter turn has a middle cell only on odd-sized grids", () => {
  for (const id of ["pinwheel", "colour_pinwheel"]) {
    assert.doesNotMatch(say(id, {}, even), /middle/);
    assert.match(say(id, {}, odd), /the middle cell stays put/);
  }
  assert.match(say("card_windmill", {}, odd), /every card except the middle one lands on another spot\. The middle card never scores\./);
});

test("a column seesaw weighs its top half against its bottom half", () => {
  assert.match(say("seesaw", { scope: "cols" }), /top half and its bottom half/);
  assert.match(say("seesaw", { scope: "rows" }), /left half and its right half/);
});

test("repeats in a row count every extra copy, not each repeated colour", () => {
  // The program scores len(row) - distinct colours: red, red, red, green is 2.
  assert.match(say("hate_repeat_row", { row: 0 }), /Each cell whose colour already appears earlier in that row adds 1 primary point/);
});

test("matching corners score the size of the biggest matching group, 1 when all differ", () => {
  const text = say("hate_same_corners", {});
  assert.match(text, /find the colour most of them share\. Each corner of that colour adds 1 primary point of badness \(1 in all if the 4 colours differ\)/);
  assert.match(say("hate_same_corners", {}, odd), /Do the same with ranks/);
});

test("colour-by-number says colours are shared, as its own key shows", () => {
  const text = say("colour_by_number", { shift: 0 });
  assert.doesNotMatch(text, /its own colour/);
  assert.match(text, /Every number has a colour, and some numbers share one\./);
});

test("a castle's own wall cells are never shut in", () => {
  // All-red 4×4 scores [0, 12] for castle_keeper {wall: red}: walls are not counted as shut-in cells.
  for (const id of ["castle_keeper", "castle_pockets"]) assert.match(say(id, { wall: "red" }), /A cell that isn't red is shut in/);
});

test("a border is every touching pair of cells of two colours, so a long border counts many times", () => {
  // 0R,0R,0G,0G ×4 rows scores [4, 16]: two 8-cell countries meet along 4 cell edges.
  const text = say("border_baron", {});
  assert.match(text, /A border is each place where a cell touches a cell of another colour/);
  assert.match(text, /A long border counts many times\./);
});

test("a magic window's lines add up to 3 times the window's middle cell", () => {
  // 1G,2G,3G,0G/4G,5R,6G,0G/7G,8G,9G,0G/0G,0G,0G,0G scores [4, 4]: row 1,2,3 is not magic (6 ≠ 3×5).
  assert.match(say("magic_window", { colour: "red" }), /3 times the number in the window's middle cell/);
});

test("a ladder's starting row does not score", () => {
  // Rows 0001 < 0002 < 0003 < 0004 score [3, 3].
  assert.match(say("ladder_of_numbers", { direction: "down" }), /the row it starts from doesn't score/);
});

test("strangers: the card's definition, its 1 rule and its 0 rule are what the program scores", () => {
  const u = evaluator({ familyId: "strangers", params: {} }, even.inst);
  const text = say("strangers", {});
  // A board of 0s scores nothing ("A 0 never scores"); each case puts two numbers side by side (or one above the other) into it.
  const board = (a: string, b: string, down = false) => {
    const cells = Array.from({ length: 16 }, () => "0R");
    cells[5] = `${a}R`;
    cells[down ? 9 : 6] = `${b}G`;
    return Array.from({ length: 4 }, (_, r) => cells.slice(4 * r, 4 * r + 4).join(",")).join("/");
  };
  assert.match(text, /^Try to make touching numbers strangers \(cells touch when they share a side\)\./);
  assert.match(text, /Two numbers are strangers when no number bigger than 1 divides both: 4 and 9 are strangers, 4 and 6 are not \(2 divides both\)\./);
  assert.deepEqual(u(board("4", "9")), [1, 0], "4 and 9 are strangers");
  assert.deepEqual(u(board("4", "6")), [0, 0], "4 and 6 are not (2 divides both)");
  assert.match(text, /So keep even numbers apart\./);
  assert.deepEqual(u(board("2", "8")), [0, 0], "two even numbers");
  assert.deepEqual(u(board("3", "9", true)), [0, 0], "a 3 above a 9");
  assert.match(text, /Each pair of touching strangers scores 1 primary point when both are bigger than 1\./);
  assert.deepEqual(u(board("2", "3")), [1, 0]);
  assert.deepEqual(u(board("4", "9", true)), [1, 0], "one above the other touches too");
  assert.match(text, /Each 1 scores 1 secondary point for every number bigger than 1 it touches\./);
  assert.deepEqual(u(board("1", "7")), [0, 1]);
  assert.deepEqual(u(board("8", "1", true)), [0, 1]);
  assert.deepEqual(u("0R,0R,0R,0R/0R,0R,2R,0R/0R,3R,1R,5R/0R,0R,7R,0R"), [0, 4], "a 1 touching four numbers bigger than 1: 4 secondary points, and 2 3 5 7 never touch");
  assert.match(text, /A 0 never scores, nor do two equal numbers\./);
  assert.deepEqual(u(board("0", "5")), [0, 0], "0 beside 5: 5 divides both");
  assert.deepEqual(u(board("0", "1")), [0, 0], "0 beside 1: a 0 never scores");
  assert.deepEqual(u(board("1", "1")), [0, 0], "1 beside 1: equal numbers never score");
  assert.deepEqual(u(board("7", "7")), [0, 0], "7 beside 7: 7 divides both");
  assert.deepEqual(u("0R,0R,0R,0R/0R,4R,0R,0R/0R,0R,9R,0R/0R,0R,0R,0R"), [0, 0], "corners do not touch");
  // Every pair of a 2-and-3 chessboard is a pair of strangers: 2 × 4 × 3 = 24 touching pairs.
  assert.deepEqual(u("2R,3R,2R,3R/3R,2R,3R,2R/2R,3R,2R,3R/3R,2R,3R,2R"), [24, 0]);
  // Base 12: A (10) and B (11) are strangers; A and 5 share 5; the value key says what A and B count.
  const b12 = context(instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" }));
  const u12 = evaluator({ familyId: "strangers", params: {} }, b12.inst);
  assert.deepEqual(u12(board("A", "B")), [1, 0]);
  assert.deepEqual(u12(board("A", "5")), [0, 0]);
  assert.match(say("strangers", {}, b12), /A counts 10 and B counts 11/);
});
