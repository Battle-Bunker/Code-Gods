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

// --- beginner pair families: each sentence checked against boards scored by the card program ----------------------

const pairs12 = context(instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" }));
const pairScore = (id: string, ctx = even) => evaluator({ familyId: id, params: {} }, ctx.inst);

test("opposite nines: a cell's opposite is where a half turn takes it; pairs making 9 score, every pair deducts its distance", () => {
  const text = say("opposite_nines", {});
  assert.match(text, /^Try to make opposite cells add up to 9\./);
  assert.match(text, /Each opposite pair that adds up to 9 scores 1 primary point\./);
  assert.match(text, /Each pair deducts as many secondary points as its total is away from 9\./);
  assert.match(text, /turn the board half way round, like the top-left and bottom-right corners/);
  const u = pairScore("opposite_nines");
  // The corners 4 and 5 are opposites and make 9; the other 7 pairs are 0 + 0, 9 away each.
  assert.deepEqual(u("4R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,5R"), [1, -63]);
  // A half turn, not a fold: row 1, column 2 lands on row 4, column 3.
  assert.deepEqual(u("0R,4R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,5R,0R"), [1, -63]);
  // Put the 5 where a fold would take the 4 instead: 4 + 0 is 5 away, 5 + 0 is 4 away, the other 6 pairs 9 each.
  assert.deepEqual(u("0R,4R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,5R,0R,0R"), [0, -63]);
  // A pair over 9 deducts as much as one under it: 8 + 7 = 15 is 6 away; the seven 4 + 5 pairs make 9.
  assert.deepEqual(u("8R,4R,4R,4R/4R,4R,4R,4R/5R,5R,5R,5R/5R,5R,5R,7R"), [7, -6]);
  // Base 12: the target is B (11), and the text says what A and B count. A + 1 and seven 5 + 6 pairs make 11.
  const t12 = say("opposite_nines", {}, pairs12);
  assert.match(t12, /^Try to make opposite cells add up to B \(11\)\./);
  assert.match(t12, /as its total is away from 11\./);
  assert.match(t12, /Here A counts 10 and B counts 11\./);
  assert.deepEqual(pairScore("opposite_nines", pairs12)("AR,5R,5R,5R/5R,5R,5R,5R/6R,6R,6R,6R/6R,6R,6R,1R"), [8, 0]);
});

test("leapfrog: each number against the one two cells along its row, one apart scores a point", () => {
  const text = say("leapfrog", {});
  assert.match(text, /^Try to make every number one away from the number two cells along its row, like 4 _ 5: leap over the cell between\./);
  assert.match(text, /Each such pair scores 1 point\./);
  const u = pairScore("leapfrog");
  // 4 _ 5 in the top row: one apart. Every other pair is 0 and 0, the same number.
  assert.equal(u("4R,9R,5R,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), 1);
  // One less counts too: 5 _ 4, and 9 _ 8 two cells along from the 9.
  assert.equal(u("5R,9R,4R,8R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), 2);
  // Side by side does not count: 4 5 7 8 has 4 _ 7 and 5 _ 8, both 3 apart.
  assert.equal(u("4R,5R,7R,8R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), 0);
  // Along its row, not its column: 4 two cells above 5 does not count.
  assert.equal(u("4R,0R,0R,0R/0R,0R,0R,0R/5R,0R,0R,0R/0R,0R,0R,0R"), 0);
  // Every pair of every row: 4 4 5 5 has 4 _ 5 and 4 _ 5; 8 pairs on 4×4.
  assert.equal(u("4R,4R,5R,5R/4R,4R,5R,5R/4R,4R,5R,5R/4R,4R,5R,5R"), 8);
  // Base 12: A (10) and B (11) are one apart, and the value key says so.
  assert.match(say("leapfrog", {}, pairs12), /Here A counts 10 and B counts 11\./);
  assert.equal(pairScore("leapfrog", pairs12)("AR,0R,BR,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), 1);
  // 6×6: 4 pairs in each row (columns 1–3, 2–4, 3–5, 4–6), 24 in all.
  const six = evaluator({ familyId: "leapfrog", params: {} }, instantiate("Grid", { size: 6, symbols: "base12", colours: "rgby" }));
  assert.equal(six(Array(6).fill("4R,4R,5R,5R,4R,4R").join("/")), 24);
});

test("strangers: only touching numbers in the same 2×2 box; the definition, the next-door rule and the 1 rule", () => {
  const u = evaluator({ familyId: "strangers", params: {} }, even.inst);
  const text = say("strangers", {});
  // A board of 0s scores nothing; each case puts two numbers into the top-left box, side by side (or one above the other).
  const two = (a: string, b: string, down = false) => {
    const cells = Array.from({ length: 16 }, () => "0R");
    cells[0] = `${a}R`;
    cells[down ? 4 : 1] = `${b}G`;
    return Array.from({ length: 4 }, (_, r) => cells.slice(4 * r, 4 * r + 4).join(",")).join("/");
  };
  assert.match(text, /^Try to make touching numbers in the same corner box strangers\./);
  assert.match(text, /Two numbers are strangers when no number bigger than 1 divides both and they are not next to each other when counting\./);
  assert.match(text, /So 4 and 9 are strangers; 4 and 6 share 2; 4 and 5 are next-door\./);
  assert.deepEqual(u(two("4", "9")), [1, 0], "4 and 9 are strangers");
  assert.deepEqual(u(two("4", "6")), [0, 0], "4 and 6 share 2");
  assert.deepEqual(u(two("4", "5")), [0, 0], "4 and 5 are next-door");
  assert.deepEqual(u(two("3", "2", true)), [0, 0], "3 and 2 are next-door");
  assert.deepEqual(u(two("3", "9", true)), [0, 0], "a 3 above a 9 share 3");
  assert.deepEqual(u(two("7", "7")), [0, 0], "7 and 7 share 7");
  assert.match(text, /Each pair of strangers scores 1 primary point when both are bigger than 1\./);
  assert.deepEqual(u(two("5", "2", true)), [1, 0], "one above the other touches too");
  assert.deepEqual(u(two("0", "5")), [0, 0], "0 is not bigger than 1 (and 5 divides both)");
  assert.match(text, /Each 1 scores 1 secondary point for every bigger number it touches in its box\./);
  assert.deepEqual(u(two("1", "7")), [0, 1]);
  assert.deepEqual(u(two("1", "2", true)), [0, 1], "1 beside 2: next-door, but a 1 scores for any bigger number");
  assert.deepEqual(u(two("1", "1")), [0, 0], "1 beside 1: no bigger number");
  assert.deepEqual(u(two("1", "0")), [0, 0], "0 is not bigger");
  // The corner boxes: rows 1–2 and 3–4, columns 1–2 and 3–4. A pair that crosses from one box to the next never scores.
  assert.deepEqual(u("0R,4R,9R,0R/0R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), [0, 0], "4 and 9 side by side across two boxes");
  assert.deepEqual(u("0R,0R,0R,0R/0R,4R,0R,0R/0R,9R,0R,0R/0R,0R,0R,0R"), [0, 0], "4 above 9 across two boxes");
  assert.deepEqual(u("0R,0R,0R,0R/0R,1R,7R,0R/0R,7R,0R,0R/0R,0R,0R,0R"), [0, 0], "a 1 beside 7s in the next boxes");
  assert.deepEqual(u("7R,7R,0R,0R/7R,1R,7R,0R/0R,7R,0R,0R/0R,0R,0R,0R"), [0, 2], "the same 1 touches the 7s above it and to its left");
  assert.deepEqual(u("4R,0R,0R,0R/0R,9R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R"), [0, 0], "corners do not touch");
  // Every touching pair inside every box: a chessboard of 2s and 5s, 4 pairs in each of the 4 boxes.
  assert.deepEqual(u("2R,5R,2R,5R/5R,2R,5R,2R/2R,5R,2R,5R/5R,2R,5R,2R"), [16, 0]);
  // Base 12: A (10) and B (11) are next-door; A and 7 are strangers; A and 5 share 5.
  const b12 = context(instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" }));
  const u12 = evaluator({ familyId: "strangers", params: {} }, b12.inst);
  assert.deepEqual(u12(two("A", "B")), [0, 0]);
  assert.deepEqual(u12(two("A", "7")), [1, 0]);
  assert.deepEqual(u12(two("A", "5")), [0, 0]);
  assert.match(say("strangers", {}, b12), /A counts 10 and B counts 11/);
  // 6×6: 9 boxes of 2×2, 3 across and 3 down; the chessboard scores 4 × 9.
  const big = context(instantiate("Grid", { size: 6, symbols: "base12", colours: "rgby" }));
  assert.match(say("strangers", {}, big), /^Try to make touching numbers in the same 2×2 box strangers\./);
  assert.match(say("strangers", {}, big), /The board is cut into 9 boxes of 2×2 cells, 3 across and 3 down\./);
  const chess6 = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => ((r + c) % 2 ? "5R" : "2R")).join(",")).join("/");
  assert.deepEqual(evaluator({ familyId: "strangers", params: {} }, big.inst)(chess6), [36, 0]);
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

test("crosswise threes: fold along the top-right to bottom-left diagonal; pairs 3 apart score, fold-line cells never count", () => {
  const text = say("crosswise_threes", {});
  assert.match(text, /^Try to fold the board corner to corner so each number lands on a number 3 apart from it, like 2 and 5\./);
  assert.match(text, /Each pair 3 apart scores 1 primary point\./);
  assert.match(text, /Each pair deducts as many secondary points as its difference is away from 3, so 4 and 4 deduct 3 and 2 and 9 deduct 4\./);
  assert.match(text, /The fold line runs from the top-right corner to the bottom-left corner, so the top row lands on the right column\./);
  assert.match(text, /Cells on the fold line have no partner, so they never score or deduct\./);
  const u = scoreOf("crosswise_threes");
  // The top-left 2 lands on the bottom-right 5: 3 apart. The other 5 pairs are 0 on 0, 3 away each.
  assert.deepEqual(u(board(["2 0 0 0", "0 0 0 0", "0 0 0 0", "0 0 0 5"])), [1, -15]);
  // The top row, left to right, lands on the right column, bottom to top: 1 on 4, 2 on 5, 3 on 6.
  assert.deepEqual(u(board(["1 2 3 0", "0 0 0 6", "0 0 0 5", "0 0 0 4"])), [3, -9]);
  // Not the other diagonal: the 2 and the 5 swap places under that fold, but here 2 on 0 is 1 off and 5 on 0 is 2 off.
  assert.deepEqual(u(board(["0 2 0 0", "5 0 0 0", "0 0 0 0", "0 0 0 0"])), [0, -15]);
  // The fold line's 9s change nothing: every other pair is 4 on 7.
  assert.deepEqual(u(board(["4 4 4 9", "4 4 9 7", "4 9 7 7", "9 7 7 7"])), [6, 0]);
  // 4 and 4 deduct 3 each (6 pairs); 2 on 9 deducts 4.
  assert.deepEqual(u(board(["4 4 4 4", "4 4 4 4", "4 4 4 4", "4 4 4 4"])), [0, -18]);
  assert.deepEqual(u(board(["2 4 4 4", "4 4 4 4", "4 4 4 4", "4 4 4 9"])), [0, -19]);
  // Base 12: A (10) and 7 are 3 apart, and the card says what A and B count.
  assert.match(say("crosswise_threes", {}, pairs12), /Here A counts 10 and B counts 11\./);
  assert.deepEqual(pairScore("crosswise_threes", pairs12)(board(["A 0 0 0", "0 0 0 0", "0 0 0 0", "0 0 0 7"])), [1, -15]);
  // Odd sizes too: 5×5 has 10 pairs and 5 fold-line cells.
  const five = instantiate("Grid", { size: 5, symbols: "base10", colours: "rgb" });
  assert.deepEqual(scoreOf("crosswise_threes", five)(board(["4 4 4 4 0", "4 4 4 0 7", "4 4 0 7 7", "4 0 7 7 7", "0 7 7 7 7"])), [10, 0]);
});

test("magic eighteen: every row (or column) against the middle total, 18 on 4×4 digits; Magic Accountant's scoring at 18", () => {
  const rows = say("magic_eighteen", { axis: "rows" });
  assert.match(rows, /^Try to make every row add up to 18\./);
  assert.match(rows, /Each row that adds up to exactly 18 scores 1 primary point\./);
  assert.match(rows, /Each row deducts as many secondary points as its total is away from 18\./);
  assert.match(say("magic_eighteen", { axis: "cols" }), /^Try to make every column add up to 18\. Each column that adds up/);
  const u = (axis: string, inst = firstSteps) => evaluator({ familyId: "magic_eighteen", params: { axis } }, inst);
  // Rows 9 9 0 0 and 4 5 4 5 make 18; 9 9 9 9 is 18 over, 0 0 0 0 is 18 short.
  const b = board(["9 9 0 0", "4 5 4 5", "9 9 9 9", "0 0 0 0"]);
  assert.deepEqual(u("rows")(b), [2, -36]);
  // Its columns make 22, 23, 13 and 14: 4 + 5 + 5 + 4 away.
  assert.deepEqual(u("cols")(b), [0, -18]);
  // Base 12 aims at 22, base 16 at 30, 6×6 digits at 27: half of the biggest total a line can make.
  const b12 = instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" });
  assert.match(say("magic_eighteen", { axis: "rows" }, context(b12)), /^Try to make every row add up to 22\..*Here A counts 10 and B counts 11\./);
  assert.deepEqual(u("rows", b12)(board(["B B 0 0", "B 0 B 0", "A 1 A 1", "0 0 0 0"])), [3, -22]);
  assert.match(say("magic_eighteen", { axis: "rows" }, context(instantiate("Grid", { size: 4, symbols: "base16", colours: "rgb" }))), /add up to 30\./);
  assert.match(say("magic_eighteen", { axis: "rows" }, context(instantiate("Grid", { size: 6, symbols: "base10", colours: "rgb" }))), /add up to 27\./);
  // The same scores as Magic Accountant dealt the magic number 18, on any board.
  for (const axis of ["rows", "cols"]) {
    const mine = u(axis), theirs = evaluator({ familyId: "magic_accountant", params: { axis, target: 18 } }, firstSteps);
    for (let i = 0; i < 40; i++) {
      const v = board(Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => String((i * 7 + r * 5 + c * 3 + r * c * i) % 10)).join(" ")));
      assert.deepEqual(mine(v), theirs(v), v);
    }
  }
});
