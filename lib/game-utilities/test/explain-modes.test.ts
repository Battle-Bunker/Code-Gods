/**
 * Alternative modes (src/explain/modes.ts): the what-if preview scores every change of one cell with the card program,
 * and Castle Keeper's step-through story ends on exactly the card's score. Expectations derived by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng } from "@workspace/game-types";
import { evaluator } from "../src/catalog.ts";
import { compareOrdinal, story, whatIf } from "../src/explain/index.ts";

const FS = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });

test("compareOrdinal: lexicographic, numbers as one-tuples", () => {
  assert.equal(compareOrdinal(3, 2), 1);
  assert.equal(compareOrdinal([1, -5], [1, -3]), -1);
  assert.equal(compareOrdinal([2, 0], [2, 0]), 0);
});

test("what if: every symbol × colour of the focus cell, scored by the card", () => {
  // Far Apart, red vs green: the middles of the red and green cells, as far apart as possible.
  const draw = { familyId: "far_apart", params: { A: 0, B: 1 } };
  // One red cell top-left, one green cell bottom-right, the rest blue: middles 3 + 3 = 6 steps apart → 6 × 64 = 384.
  const value = "0R,0B,0B,0B/0B,0B,0B,0B/0B,0B,0B,0B/0B,0B,0B,0G";
  const w = whatIf(draw, FS, value, { r: 0, c: 1 })!;
  assert.equal(w.ordinal, 384);
  assert.equal(w.entries.length, 10, "one row per symbol");
  assert.equal(w.entries[0].length, 3, "one column per colour");
  assert.equal(w.entries[0][2].current, true, "the cell as it is: 0 blue");
  // Painting (0,1) red moves the red middle half a step right: 2.5 + 3 = 5.5 steps → 352, 32 points worse.
  assert.equal(w.entries[0][0].delta, -32);
  assert.equal(w.entries[0][0].verdict, -1);
  // Painting it green pulls the green middle towards the top: |0 − 1.5| + |0 − 2| = 3.5 → 224.
  assert.equal(w.entries[5][1].ordinal, 224);
  assert.ok(w.entries.every(row => row.every(e => e.ordinal === evaluator(draw, FS)(e.value))), "each entry is the card's own score of its board");
  assert.equal(whatIf(draw, FS, value, { r: 4, c: 0 }), null);
});

test("Castle Keeper's story: walls, water spreading from the edge, and the shut-in cells it can't reach", () => {
  const draw = { familyId: "castle_keeper", params: { W: 0, mode: "plain", T: null } };
  // On 4×4 a red ring round the middle 2×2 is the whole edge: 12 walls, no water gets in, 4 shut-in cells.
  const ring = story(draw, FS, "0R,0R,0R,0R/0R,0B,0G,0R/0R,0B,0B,0R/0R,0R,0R,0R")!;
  assert.equal(ring.frames.at(-1)!.points, 4);
  assert.match(ring.frames[1].text, /The whole edge is wall/);
  // Walls at (1,1) (1,2) (2,1): the gap at (2,2) touches the edge water, so nothing is enclosed.
  const open = story(draw, FS, "0G,0G,0G,0G/0G,0R,0R,0G/0G,0R,0B,0G/0G,0G,0G,0G")!;
  assert.equal(open.frames.at(-1)!.points, 0);
  assert.deepEqual(open.frames.map(f => f.marks.filter(m => m.role === "new-water").length), [0, 12, 1, 0], "12 edge cells, then (2,2)");
  assert.equal(story({ familyId: "castle_keeper", params: { W: 0, mode: "eyes", T: null } }, FS, "0R,0R,0R,0R/0R,0B,0G,0R/0R,0B,0B,0R/0R,0R,0R,0R"), null, "other modes have no story");
});

test("Castle Keeper's story always ends on the card's score (seeded boards)", () => {
  const draw = { familyId: "castle_keeper", params: { W: 1, mode: "plain", T: null } };
  const rng = seededRng("castle-story"), letters = "RGB";
  for (let k = 0; k < 300; k++) {
    // Green walls about half the time, so some boards enclose cells and some don't.
    const rows = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => `${rng.int(10)}${rng.int(2) ? "G" : letters[rng.int(3)]}`).join(","));
    const value = rows.join("/"), s = story(draw, FS, value)!;
    const ord = s.ordinal as readonly number[];
    assert.equal(s.frames.at(-1)!.points, ord[0], value);
  }
});
