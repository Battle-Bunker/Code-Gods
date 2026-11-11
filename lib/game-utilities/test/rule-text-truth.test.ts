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

// --- beginner families: each sentence's claims, scored by the card program on concrete boards ---------------------------
const firstSteps = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const bigBoard = instantiate("Grid", { size: 6, symbols: "base12", colours: "rgby" });
const scoreOf = (id: string, inst = firstSteps) => evaluator({ familyId: id, params: {} }, inst);
const board = (rows: string[]) => rows.map(r => r.split(" ").map(x => `${x}R`).join(",")).join("/");

test("two pair: the 2×2 boxes that tile the board; two different pairs, one pair or three of a kind", () => {
  assert.match(say("two_pair", {}), /^Try to fill each of the 4 corner boxes with two different pairs, like 3, 3, 8 and 8 in any order\./);
  assert.match(say("two_pair", {}), /The board is cut into 4 corner boxes of 2×2 cells/);
  assert.match(say("two_pair", {}, context(bigBoard)), /each of the 9 boxes/);
  assert.match(say("two_pair", {}, context(bigBoard)), /3 across and 3 down/);
  assert.match(say("two_pair", {}), /Each box with two different pairs scores 1 primary point\. Each box with only one pair, or three of a kind, scores 1 secondary point\. Four of a kind scores nothing\./);
  const u = scoreOf("two_pair");
  // Boxes: 3 3 / 8 8 and 8 3 / 3 8 (two different pairs, in any order); 5 5 / 5 1 (three of a kind); 4 4 / 4 4 (four of a kind: nothing).
  assert.deepEqual(u(board(["3 3 8 3", "8 8 3 8", "5 5 4 4", "5 1 4 4"])), [2, 1]);
  // 2 2 / 6 7 (one pair), 1 2 / 3 4 (no pair), 0 0 / 0 9 and 9 9 / 9 0 (three of a kind).
  assert.deepEqual(u(board(["2 2 1 2", "6 7 3 4", "0 0 9 9", "0 9 9 0"])), [0, 3]);
  // The boxes don't overlap: the middle square 5 6 / 6 5 is not a box.
  assert.deepEqual(u(board(["0 1 2 3", "4 5 6 7", "0 6 5 1", "2 3 4 7"])), [0, 0]);
  // Colours never matter.
  assert.deepEqual(u("3R,3G,8R,3B/8B,8R,3G,8R/5R,5G,4R,4B/5R,1R,4G,4R"), [2, 1]);
  // 6×6: 9 boxes, 3 across and 3 down; the bottom-right one is the box at rows 5–6, columns 5–6.
  assert.deepEqual(scoreOf("two_pair", bigBoard)(board(["0 1 2 3 4 5", "6 7 8 9 A B", "0 1 2 3 4 5", "6 7 8 9 A B", "0 1 2 3 7 7", "6 7 8 9 B B"])), [1, 0]);
});

test("spread of three: every overlapping 2×2 square, biggest minus smallest against 3", () => {
  assert.match(say("spread_three", {}), /^Try to give every 2×2 square a spread of exactly 3\./);
  assert.match(say("spread_three", {}), /Each 2×2 square with a spread of exactly 3 scores 1 primary point\. Each square deducts 1 secondary point for each step its spread is away from 3\./);
  assert.match(say("spread_three", {}), /There are 9 squares on this board, and they overlap/);
  assert.match(say("spread_three", {}, context(bigBoard)), /There are 25 squares/);
  assert.match(say("spread_three", {}, context(bigBoard)), /A counts 10 and B counts 11/);
  const u = scoreOf("spread_three");
  // A chessboard of 0s and 3s: all 9 squares spread exactly 3.
  assert.deepEqual(u(board(["0 3 0 3", "3 0 3 0", "0 3 0 3", "3 0 3 0"])), [9, 0]);
  // One number everywhere: every square spreads 0, 3 away from 3.
  assert.deepEqual(u(board(["5 5 5 5", "5 5 5 5", "5 5 5 5", "5 5 5 5"])), [0, -27]);
  // 2 5 8 1 / 4 4 4 7 / 6 3 9 0 / 1 7 3 5: spreads 3, 4, 7 / 3, 6, 9 / 6, 6, 9 → 2 squares, off by 1+4+3+6+3+3+6 = 26.
  assert.deepEqual(u("2R,5R,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,5G"), [2, -26]);
  // Base 12: B counts 11, so B 8 / 9 A spreads 11 − 8 = 3. Its three neighbours spread 2 (1 off each); the other 21 squares are all 8s (3 off each).
  const sixes = ["B 8 8 8 8 8", "9 A 8 8 8 8", ...Array(4).fill("8 8 8 8 8 8")];
  assert.deepEqual(scoreOf("spread_three", bigBoard)(board(sixes)), [1, -(3 + 63)]);
});
