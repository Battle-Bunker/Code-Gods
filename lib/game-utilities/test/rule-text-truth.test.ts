/**
 * Rule text that must match what the program computes on the shipped boards (production-readiness audit, 2026-11-11):
 * each case is a sentence that was false of its scoring code on some shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { context, family } from "../src/catalog.ts";

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
