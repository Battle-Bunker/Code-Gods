/**
 * The old game's Magic Accountant, Number Bonds, Stepping Stones and Kings and Subjects on the coloured boards
 * (src/families/v1-numbers-c.ts). Every expected score is worked out by hand from the old cards' programs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite } from "@workspace/v2-core";
import { board4Type, board4rgb, board5rgby, board7cards, decodeBoard } from "../src/index.ts";
import { originalKingsAndSubjects, originalMagicAccountant, originalNumberBonds, originalSteppingStones } from "../src/families/v1-numbers-c.ts";

const scoreOf = <P,>(f: { id: string }, p: P, w: string, tb: string | null) =>
  evaluateSite(board4Type, f as never, p, decodeBoard(w), board4rgb, 0, tb).score?.map(x => x && Number(x.n));

test("Magic Accountant: rows or columns adding up to the magic number, then every total's distance from it", () => {
  const f = originalMagicAccountant();
  assert.equal(f.id, "original-magic-accountant");
  // 4×4 digits: the middle total 18 and 3 either side, rows or columns (14 sets); 7×7 cards: 49 ± 3.
  const four = f.dealable(board4rgb);
  assert.equal(four.length, 14);
  assert.deepEqual(four.filter(p => p.axis === "rows").map(p => p.target), [15, 16, 17, 18, 19, 20, 21]);
  assert.deepEqual(f.dealable(board7cards).filter(p => p.axis === "columns").map(p => p.target), [46, 47, 48, 49, 50, 51, 52]);
  // Rows total 18, 18, 10, 36; columns 24, 25, 17, 16.
  const w = "9R,9G,0B,0R/5R,5G,5B,3R/1G,2G,3G,4G/9B,9B,9B,9B";
  assert.deepEqual(scoreOf(f, { axis: "rows", target: 18 }, w, "magic-distance"), [2, -26]);
  assert.deepEqual(scoreOf(f, { axis: "columns", target: 18 }, w, "magic-distance"), [0, -16]);
  assert.deepEqual(scoreOf(f, { axis: "columns", target: 17 }, w, "magic-distance"), [1, -16]);
  assert.deepEqual(scoreOf(f, { axis: "rows", target: 18 }, w, null), [2]);
});

test("Number Bonds: touching pairs (right and down) adding up to one more than the biggest number", () => {
  const f = originalNumberBonds();
  assert.equal(f.id, "original-number-bonds");
  assert.deepEqual(f.dealable(board4rgb), [{ target: 10 }]);
  assert.deepEqual(f.dealable(board7cards), [{ target: 14 }]);
  // 7 + 3 across the top, 2 + 8 down the first column; colours do not matter.
  assert.deepEqual(scoreOf(f, { target: 10 }, "7R,3G,0B,1R/2R,9B,4G,4G/8R,0R,0R,0R/1B,1B,1B,1B", null), [2]);
  // All fives: every one of the 24 touching pairs.
  assert.deepEqual(scoreOf(f, { target: 10 }, "5R,5G,5B,5R/5R,5G,5B,5R/5R,5G,5B,5R/5R,5G,5B,5R", null), [24]);
});

test("Stepping Stones: the biggest group joined by hops of exactly 2 between touching cells", () => {
  const f = originalSteppingStones();
  assert.equal(f.id, "original-stepping-stones");
  assert.deepEqual(f.dealable(board4rgb), [{ hop: 2 }]);
  // 0 2 4 6 and the 8 under the 6 make 5; 1 3 5 7 with the 9 under the 7, the 7 under the 5 and the 9 left of it make 7.
  assert.deepEqual(scoreOf(f, { hop: 2 }, "0R,2G,4B,6R/9R,9G,9B,8R/1G,3G,5G,7G/9B,9B,7B,9B", null), [7]);
  // A lonely cell is a group of 1.
  assert.deepEqual(scoreOf(f, { hop: 2 }, "0R,0G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R", null), [1]);
});

test("Kings and Subjects: the four corner boxes as courts, then every box's gap (no king deducts 20)", () => {
  const f = originalKingsAndSubjects();
  assert.equal(f.id, "original-kings-and-subjects");
  assert.deepEqual(f.dealable(board4rgb), [{ squares: "corners", noKing: 20 }]);
  assert.deepEqual(f.dealable(board5rgby), []);
  assert.deepEqual(f.dealable(board7cards), []);
  const p = { squares: "corners", noKing: 20 } as const;
  // 9 | 2 3 4: a court; 5 | 1 1 2: one away; all zeros: no king (20); 8 | 7 1 0: a court.
  assert.deepEqual(scoreOf(f, p, "9R,2G,1B,1R/3R,4G,5B,2R/0G,0G,8G,7G/0B,0B,1B,0B", "court-gaps"), [2, -21]);
  // Two fives tie for biggest: no king, though 5 = 5 + 0 + 0 would otherwise hold.
  assert.deepEqual(scoreOf(f, p, "5R,5G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R", "court-gaps"), [0, -80]);
  // Every overlapping square (the expert variant): 9 squares on 4×4.
  assert.deepEqual(scoreOf(f, { squares: "all", noKing: 20 }, "0R,0G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R/0R,0G,0B,0R", "court-gaps"), [0, -180]);
});
