/**
 * The old game's beginner number rules Spread of Three, Strangers, Leapfrog and Crosswise Threes on the coloured
 * boards: expected scores worked out by hand from the old python cards (archive grid/beginner/*.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type RuleFamily } from "@workspace/v2-core";
import { board4Type, board4rgb, board5rgby, board6hex, board7cards, decodeBoard, type BoardState } from "../src/index.ts";
import { originalCrosswiseThrees, originalLeapfrog, originalSpreadThree, originalStrangers } from "../src/families/v1-numbers-b.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const score = (f: RuleFamily<BoardState, any>, w: string, tb: string | null = null) =>
  evaluateSite(board4Type, f, {}, decodeBoard(w), board4rgb, 0, tb).score?.map(x => x && Number(x.n));

/**
 *   7 4 5 1
 *   5 6 9 2
 *   0 8 3 3
 *   1 2 4 6
 */
const A = "7R,4G,5B,1R/5R,6B,9G,2G/0R,8R,3B,3B/1B,2B,4B,6B";

test("the four ids, and each dealt once on 4×4 digits, as the old game's requires had them", () => {
  const fs = [originalSpreadThree(), originalStrangers(), originalLeapfrog(), originalCrosswiseThrees()];
  assert.deepEqual(fs.map(f => f.id), ["original-spread-three", "original-strangers", "original-leapfrog", "original-crosswise-threes"]);
  for (const f of fs) assert.deepEqual(f.dealable(board4rgb), [{}], f.id);
  // Strangers needs an even side; none is dealt on cards or past 6×6.
  assert.deepEqual(originalStrangers().dealable(board5rgby), []);
  assert.deepEqual(originalLeapfrog().dealable(board5rgby), [{}]);
  assert.deepEqual(originalStrangers().dealable(board6hex), [{}]);
  for (const f of fs) assert.deepEqual(f.dealable(board7cards), [], f.id);
  for (const f of fs) for (const t of [f.main, ...f.tieBreakers]) assert.doesNotMatch(`${t.title} ${t.sentence({})}`, /(?<!fold )\blines?\b/, f.id);   // "fold line" is the old card's word
});

test("Spread of Three: squares spreading exactly 3 count; the secondary deducts each step from 3", () => {
  // Squares by top-left cell: (0,0) 7 4 5 6 spread 3 ✓; (0,1) 5 (off 2); (0,2) 8 (5); (1,0) 8 (5); (1,1) 6 (3);
  // (1,2) 7 (4); (2,0) 8 (5); (2,1) 6 (3); (2,2) 3 3 4 6 spread 3 ✓. Two spot on, 27 steps off.
  assert.deepEqual(score(originalSpreadThree(), A, "spread-gaps"), [2, -27]);
  assert.deepEqual(score(originalSpreadThree(), A), [2]);
  // A chessboard of 0s and 3s: every square spot on. One number everywhere: none, each 3 off.
  assert.deepEqual(score(originalSpreadThree(), "0R,3R,0R,3R/3G,0G,3G,0G/0B,3B,0B,3B/3R,0R,3R,0R", "spread-gaps"), [9, 0]);
  assert.deepEqual(score(originalSpreadThree(), "5R,5R,5R,5R/5R,5R,5R,5R/5R,5R,5R,5R/5R,5R,5R,5R", "spread-gaps"), [0, -27]);
});

test("Strangers: pairs inside the 2×2 boxes only; a 1 beside a bigger number is the secondary", () => {
  // Rows: 7|4 ✓, 5|1 one; 5|6 next-door; 9|2 ✓; 0|8 skip; 3|3 share 3; 1|2 one; 4|6 share 2.
  // Columns: 7/5 ✓; 0/1 skip; 4/6 share 2; 8/2 share 2; 5/9 ✓; 3/4 next-door; 1/2 one; 3/6 share 3.
  assert.deepEqual(score(originalStrangers(), A, "ones-beside-bigger"), [4, 3]);
  // Pairs across two boxes never count (2 5 and 3 5 across the middle of rows 1 and 2); 1 over 1 is no pair; 5 4,
  // 2 over 3 and 4 over 5 are next-door; 5 5 shares 5. Only the 1s beside 2 and 3 score.
  assert.deepEqual(score(originalStrangers(), "1R,2R,5R,4R/1R,3R,5R,5R/0R,0R,0R,0R/0R,0R,0R,0R", "ones-beside-bigger"), [0, 2]);
  // The old best board: a chessboard of 2s and 5s, every one of the 16 pairs.
  assert.deepEqual(score(originalStrangers(), "2R,5G,2B,5R/5R,2G,5B,2R/2R,5G,2B,5R/5R,2G,5B,2R", "ones-beside-bigger"), [16, 0]);
});

test("Leapfrog: numbers one apart two cells along a row; columns do not count", () => {
  // Rows: 4 _ 5 ✓, 1 _ 4; 4 _ 7, 8 _ 9 ✓; 9 _ 8 ✓, 3 _ 2 ✓; 0 _ 1 ✓, 0 _ 1 ✓.
  assert.deepEqual(score(originalLeapfrog(), "4R,1G,5B,4R/4G,8B,7R,9G/9B,3R,8G,2B/0R,0R,1R,1R"), [6]);
  assert.deepEqual(score(originalLeapfrog(), A), [0]);
  assert.deepEqual(score(originalLeapfrog(), "4R,0R,0R,0R/0R,0R,0R,0R/5R,0R,0R,0R/0R,0R,0R,0R"), [0]);
});

test("Crosswise Threes: fold top-right to bottom-left; pairs 3 apart count, the secondary deducts each step from 3", () => {
  // (0,0)7 on (3,3)6 off 2; (0,1)4 on (2,3)3 off 2; (0,2)5 on (1,3)2 ✓; (1,0)5 on (3,2)4 off 2; (1,1)6 on (2,2)3 ✓;
  // (2,0)0 on (3,1)2 off 1. The fold-line cells 1, 9, 8, 1 never count.
  assert.deepEqual(score(originalCrosswiseThrees(), A, "fold-gaps"), [2, -7]);
  // The old exemplar: 4 above the fold line, 7 below it, anything on it.
  assert.deepEqual(score(originalCrosswiseThrees(), "4R,4R,4R,9R/4R,4R,0R,7R/4R,2R,7R,7R/5R,7R,7R,7R", "fold-gaps"), [6, 0]);
});
