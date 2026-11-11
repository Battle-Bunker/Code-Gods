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

// --- beginner pair families: each sentence checked against boards scored by the card program ----------------------
import { evaluator as pairEvaluator } from "../src/catalog.ts";

const pairs12 = context(instantiate("Grid", { size: 4, symbols: "base12", colours: "rgb" }));
const pairScore = (id: string, ctx = even) => pairEvaluator({ familyId: id, params: {} }, ctx.inst);

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

test("step-stool mirror: folding top onto bottom pairs each cell with the one in the same column of the mirrored row", () => {
  const text = say("step_stool", {});
  assert.match(text, /^Try to fold the board top onto bottom so each number lands on a number one apart from it, like 4 and 5\./);
  assert.match(text, /Each pair one apart scores 1 primary point\./);
  assert.match(text, /so 4 and 4 deduct 1 and 2 and 6 deduct 3\./);
  assert.match(text, /the top row on the bottom row, the second row on the second-last row/);
  const u = pairScore("step_stool");
  // 4 lands on 5: one apart. Every other pair is 0 on 0, the same number: 1 away from one apart.
  assert.deepEqual(u("4R,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R/5R,0R,0R,0R"), [1, -7]);
  // 2 lands on 6: 4 apart deducts 3; every other pair is 0 on 1.
  assert.deepEqual(u("2R,0R,0R,0R/0R,0R,0R,0R/1R,1R,1R,1R/6R,1R,1R,1R"), [7, -3]);
  // Side by side does not count: rows stepping 4, 5, 4, 5 fold onto equal rows, so every pair deducts 1.
  assert.deepEqual(u("4R,5R,4R,5R/4R,5R,4R,5R/4R,5R,4R,5R/4R,5R,4R,5R"), [0, -8]);
  // Base 12: A (10) and B (11) are one apart.
  assert.match(say("step_stool", {}, pairs12), /Here A counts 10 and B counts 11\./);
  assert.deepEqual(pairScore("step_stool", pairs12)("AR,0R,0R,0R/0R,0R,0R,0R/0R,0R,0R,0R/BR,0R,0R,0R"), [1, -7]);
});
