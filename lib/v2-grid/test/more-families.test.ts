import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, moreGridFamilies, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = (id: string) => gridType.families.find(f => f.id === id)!;
const terms = (id: string, s: GridState, params: unknown = {}) => {
  const e = evaluateSite(gridType, fam(id), params, s, grid4, 0, null);
  return Object.fromEntries(e.terms.map(t => [t.id, Number((t.value as Q).n)]));
};
const main = (id: string, s: GridState, params: unknown = {}) => terms(id, s, params)[fam(id).main.id];

test("the seven families are in the pool, in order, each with one term per layer and three tie-breakers", () => {
  const ids = moreGridFamilies(4).map(f => f.id);
  assert.deepEqual(ids, ["kings-and-subjects", "stepping-stones", "mountain-climb", "uphill", "staircase", "magic-accountant", "fillomino"]);
  const all = gridType.families.map(f => f.id), k = all.indexOf(ids[0]!);
  assert.deepEqual(all.slice(k, k + 7), ids);
  assert.equal(new Set(gridType.families.map(f => f.id)).size, gridType.families.length);
  const s = board("9155", "1100", "0073", "0021");
  const TIES: Record<string, string[]> = {
    "kings-and-subjects": ["different-kings", "king-multiples", "kings-on-diagonals"],
    "stepping-stones": ["outside-small", "group-reach", "group-corners"],
    "mountain-climb": ["climb-reach", "climb-far", "climb-summit"],
    uphill: ["rise-by-one", "corner-peak", "start-low"],
    staircase: ["long-flight", "double-stairs", "low-stairs"],
    "magic-accountant": ["other-way", "diagonals", "all-different"],
    fillomino: ["patch-kinds", "patch-count", "near-misses"],
  };
  for (const id of ids) {
    const f = fam(id);
    assert.deepEqual(f.tieBreakers.map(t => t.id), TIES[id], id);
    for (const p of f.dealable(grid4)) assert.deepEqual(Object.keys(terms(id, s, p)).sort(), [f.main.id, ...f.tieBreakers.map(t => t.id)].sort(), id);
  }
});

test("dealable params", () => {
  for (const id of ["kings-and-subjects", "stepping-stones", "mountain-climb", "fillomino"]) assert.deepEqual(fam(id).dealable(grid4), [{}]);
  assert.deepEqual(fam("uphill").dealable(grid4), [{ corner: "BR" }, { corner: "BL" }, { corner: "TR" }, { corner: "TL" }]);
  assert.deepEqual(fam("staircase").dealable(grid4), [{ direction: "right" }, { direction: "down" }]);
  const acc = fam("magic-accountant").dealable(grid4) as { axis: string; T: number }[];
  assert.equal(acc.length, 2);
  for (const axis of ["rows", "columns"]) assert.deepEqual(acc.filter(p => p.axis === axis).map(p => p.T), [18]);
  assert.match(fam("uphill").card({ corner: "BL" }, null), /the bottom-left corner/);
});

test("tie-breaker sentences name the dealt corner, direction, axis and T; no grid sentence says 'line'", () => {
  assert.match(fam("uphill").card({ corner: "BL" }, "corner-peak"), /Secondary: The number in the bottom-left corner should be bigger than as many other numbers as possible\.$/);
  assert.match(fam("uphill").card({ corner: "BL" }, "start-low"), /Secondary: The number in the top-right corner should be smaller/);
  assert.match(fam("staircase").card({ direction: "right" }, "double-stairs"), /1 more than the number above them\.$/);
  assert.match(fam("staircase").card({ direction: "down" }, "double-stairs"), /1 more than the number to their left\.$/);
  assert.match(fam("magic-accountant").card({ axis: "rows", T: 17 }, "other-way"), /Secondary: The columns should add up to 17 too\.$/);
  assert.match(fam("magic-accountant").card({ axis: "columns", T: 15 }, "all-different"), /Secondary: Each column should hold four different numbers\.$/);
  for (const f of moreGridFamilies(4)) for (const p of f.dealable(grid4)) for (const t of [f.main, ...f.tieBreakers]) {
    assert.doesNotMatch(`${t.title} ${f.card(p, t.id)}`, /\bline\b/i, `${f.id}/${t.id}`);
  }
});

test("Kings and Subjects: every king equals his subjects; a tied biggest number is 20 off", () => {
  assert.equal(main("kings-and-subjects", board("9261", "3423", "5184", "1322")), 0);
  // 9 vs 1+1+1 (6); 5 5 0 0 tied (20); 0 0 0 0 tied (20); 7 vs 3+2+1 (1)
  // 9 vs 1+1+1 (6); 5 5 0 0 tied (20, no king); 0 0 0 0 tied (20, no king); 7 vs 3+2+1 (1). Kings 9 (top-left cell) and
  // 7 (row 2, column 2): one pair, both multiples of 1, both on a diagonal; the tied boxes are skipped.
  assert.deepEqual(terms("kings-and-subjects", board("9155", "1100", "0073", "0021")),
    { kings: 6 + 20 + 20 + 1, "different-kings": 1, "king-multiples": 2, "kings-on-diagonals": 2 });
  // Kings 9 (with a 2: no), 6 (with a 1), 5 (with a 1), 8 (with a 2); all different (6 pairs); 9 and 8 on diagonals.
  const t = terms("kings-and-subjects", board("9261", "3423", "5184", "1322"));
  assert.deepEqual([t["different-kings"], t["king-multiples"], t["kings-on-diagonals"]], [6, 3, 2]);
  // The one king (8) has a 0 in his box: the smallest must be at least 1.
  const z = terms("kings-and-subjects", board("8200", "0100", "0000", "0000"));
  assert.deepEqual([z["different-kings"], z["king-multiples"], z["kings-on-diagonals"]], [0, 0, 1]);
});

test("Stepping Stones: the biggest group joined by hops of exactly 2", () => {
  assert.equal(main("stepping-stones", board("1313", "3131", "1313", "3131")), 16);
  assert.equal(main("stepping-stones", board("0200", "0000", "4000", "0000")), 4);   // 0 2 0 on top and the 0 under the 2
  assert.equal(main("stepping-stones", board("5555", "5555", "5555", "5555")), 1, "equal neighbours never join");
});

test("Stepping Stones tie-breakers read the biggest group (the first found on a tie)", () => {
  const ties = (s: GridState) => { const t = terms("stepping-stones", s); return [t["outside-small"], t["group-reach"], t["group-corners"]]; };
  assert.deepEqual(ties(board("0200", "0000", "4000", "0000")), [4, 2 + 3, 1]);   // the group: cells 0, 1, 2, 5; outside it only the 4
  assert.deepEqual(ties(board("1313", "3131", "1313", "3131")), [0, 8, 4], "every cell in the group");
  assert.deepEqual(ties(board("5555", "5555", "5555", "5555")), [75, 2, 1], "sixteen groups of one: the top-left cell's");
});

test("Mountain Climb: cells on the longest +1 climb from the top-left", () => {
  assert.equal(main("mountain-climb", board("0123", "7654", "8000", "9000")), 10);
  assert.equal(main("mountain-climb", board("3400", "0500", "0000", "0000")), 3);
  assert.equal(main("mountain-climb", board("9000", "0000", "0000", "0000")), 1, "a climb holds at least its start");
});

test("Mountain Climb tie-breakers: cells reached, how far across and down, the summit", () => {
  const ties = (s: GridState) => { const t = terms("mountain-climb", s); return [t["climb-reach"], t["climb-far"], t["climb-summit"]]; };
  assert.deepEqual(ties(board("0123", "7654", "8000", "9000")), [10, 4, 9]);   // the 4 at row 1, column 3
  assert.deepEqual(ties(board("3400", "0500", "0000", "0000")), [3, 2, 5]);
  assert.deepEqual(ties(board("0100", "1200", "0000", "0000")), [4, 2, 2], "two climbs branch and meet: four cells, three on the longest");
  assert.deepEqual(ties(board("9000", "0000", "0000", "0000")), [1, 0, 9]);
});

test("Uphill: rising steps toward the dealt corner", () => {
  assert.equal(main("uphill", board("0123", "1234", "2345", "3456"), { corner: "BR" }), 24);
  assert.equal(main("uphill", board("0123", "1234", "2345", "3456"), { corner: "TL" }), 0);
  const s = board("0123", "0000", "0000", "0000");
  assert.deepEqual((["BR", "TL", "TR", "BL"] as const).map(corner => main("uphill", s, { corner })), [3, 3, 6, 0]);
  assert.equal(main("uphill", board("5555", "5555", "5555", "5555"), { corner: "BR" }), 0, "an equal step is no rise");
});

test("Uphill tie-breakers: rises of exactly 1, the corner walked toward, the corner walks start from", () => {
  const ties = (s: GridState, corner: string) => { const t = terms("uphill", s, { corner }); return [t["rise-by-one"], t["corner-peak"], t["start-low"]]; };
  const ramp = board("0123", "1234", "2345", "3456");
  assert.deepEqual(ties(ramp, "BR"), [24, 15, 15]);
  assert.deepEqual(ties(ramp, "TL"), [0, 0, 0]);
  const s = board("0123", "0000", "0000", "0000");
  assert.deepEqual(ties(s, "TR"), [3 + 1, 15, 3]);   // up the columns the steps rise 1, 2 and 3; the bottom-left 0 is below the 1, 2, 3
  assert.deepEqual(ties(s, "BL"), [0, 0, 0]);
});

test("Staircase: numbers exactly 1 more than the one before", () => {
  assert.equal(main("staircase", board("0123", "0123", "0123", "0123"), { direction: "right" }), 12);
  assert.equal(main("staircase", board("0123", "0123", "0123", "0123"), { direction: "down" }), 0);
  assert.equal(main("staircase", board("1245", "3333", "0000", "0000"), { direction: "right" }), 2);
  assert.equal(main("staircase", board("1245", "3333", "0000", "0000"), { direction: "down" }), 1);
  assert.equal(main("staircase", board("9012", "0000", "0000", "0000"), { direction: "right" }), 2, "9 to 0 is no step");
});

test("Staircase tie-breakers: the longest flight, stairs both ways, the numbers stairs climb from", () => {
  const ties = (s: GridState, direction: string) => { const t = terms("staircase", s, { direction }); return [t["long-flight"], t["double-stairs"], t["low-stairs"]]; };
  const rows = board("0123", "0123", "0123", "0123");
  assert.deepEqual(ties(rows, "right"), [4, 0, 4 * (0 + 1 + 2)]);
  assert.deepEqual(ties(rows, "down"), [1, 0, 0], "no stairs: a flight of one cell, nothing climbed from");
  const ramp = board("0123", "1234", "2345", "3456");
  assert.deepEqual(ties(ramp, "right"), [4, 9, 3 + 6 + 9 + 12]);
  assert.deepEqual(ties(ramp, "down"), [4, 9, 3 + 6 + 9 + 12]);
  const s = board("1245", "3333", "0000", "0000");
  assert.deepEqual(ties(s, "right"), [2, 0, 1 + 4]);   // 1 2 and 4 5: two flights of two
  assert.deepEqual(ties(s, "down"), [2, 0, 2]);    // the 3 under the 2; the 3 to its left is no step
  assert.deepEqual(ties(board("0100", "1200", "0000", "0000"), "down"), [2, 1, 0 + 1]);   // the 2 is 1 more than the 1 above and the 1 to its left
});

test("Magic Accountant: how far each row's (or column's) total is from T", () => {
  const s = board("9900", "0990", "4545", "3366");
  assert.equal(main("magic-accountant", s, { axis: "rows", T: 18 }), 0);
  assert.equal(main("magic-accountant", s, { axis: "columns", T: 18 }), 2 + 8 + 1 + 7);   // columns 16, 26, 19, 11
  assert.equal(main("magic-accountant", s, { axis: "columns", T: 15 }), 1 + 11 + 4 + 4);
  assert.equal(main("magic-accountant", board("0000", "0000", "0000", "0000"), { axis: "rows", T: 21 }), 84);
});

test("Magic Accountant tie-breakers: the other way, the diagonals, four different numbers", () => {
  const ties = (s: GridState, p: object) => { const t = terms("magic-accountant", s, p); return [t["other-way"], t.diagonals, t["all-different"]]; };
  const s = board("9900", "0990", "4545", "3366");   // diagonals 9+9+4+6 = 28 and 0+9+5+3 = 17
  assert.deepEqual(ties(s, { axis: "rows", T: 18 }), [2 + 8 + 1 + 7, 10 + 1, 0]);
  assert.deepEqual(ties(s, { axis: "columns", T: 18 }), [0, 10 + 1, 2]);   // columns 9 0 4 3 and 0 9 4 6
  assert.deepEqual(ties(board("0000", "0000", "0000", "0000"), { axis: "rows", T: 21 }), [84, 42, 0]);
});

test("Fillomino: cells in patches whose size is their number; 0-patches never count", () => {
  assert.equal(main("fillomino", board("4444", "1221", "4444", "1221")), 16);
  assert.equal(main("fillomino", board("0000", "0000", "3330", "1000")), 3 + 1);
  assert.equal(main("fillomino", board("2222", "0000", "0000", "0000")), 0, "four 2s is the wrong size");
  assert.equal(main("fillomino", board("0000", "0000", "0000", "0000")), 0);
});

test("Fillomino tie-breakers: kinds and number of right-size patches, how near the wrong-size ones are; 0-patches never count", () => {
  const ties = (s: GridState) => { const t = terms("fillomino", s); return [t["patch-kinds"], t["patch-count"], t["near-misses"]]; };
  assert.deepEqual(ties(board("4444", "1221", "4444", "1221")), [3, 8, 0]);
  assert.deepEqual(ties(board("0000", "0000", "3330", "1000")), [2, 2, 0]);
  assert.deepEqual(ties(board("2222", "0000", "0000", "0000")), [0, 0, 2]);
  assert.deepEqual(ties(board("3300", "0000", "0005", "0055")), [0, 0, 1 + 2]);
  assert.deepEqual(ties(board("0000", "0000", "0000", "0000")), [0, 0, 0]);
});
