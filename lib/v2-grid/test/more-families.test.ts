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
  assert.deepEqual(gridType.families.slice(-7).map(f => f.id), ids);
  assert.equal(new Set(gridType.families.map(f => f.id)).size, gridType.families.length);
  const s = board("9155", "1100", "0073", "0021");
  for (const id of ids) {
    const f = fam(id);
    assert.equal(f.tieBreakers.length, 3, id);
    for (const p of f.dealable(grid4)) assert.deepEqual(Object.keys(terms(id, s, p)).sort(), [f.main.id, ...f.tieBreakers.map(t => t.id)].sort(), id);
  }
});

test("dealable params", () => {
  for (const id of ["kings-and-subjects", "stepping-stones", "mountain-climb", "fillomino"]) assert.deepEqual(fam(id).dealable(grid4), [{}]);
  assert.deepEqual(fam("uphill").dealable(grid4), [{ corner: "TL" }, { corner: "TR" }, { corner: "BL" }, { corner: "BR" }]);
  assert.deepEqual(fam("staircase").dealable(grid4), [{ direction: "right" }, { direction: "down" }]);
  const acc = fam("magic-accountant").dealable(grid4) as { axis: string; T: number }[];
  assert.equal(acc.length, 14);
  for (const axis of ["rows", "columns"]) assert.deepEqual(acc.filter(p => p.axis === axis).map(p => p.T), [15, 16, 17, 18, 19, 20, 21]);
  assert.match(fam("uphill").card({ corner: "BL" }, null), /the bottom-left corner/);
});

test("Kings and Subjects: every king equals his subjects; a tied biggest number is 20 off", () => {
  assert.equal(main("kings-and-subjects", board("9261", "3423", "5184", "1322")), 0);
  // 9 vs 1+1+1 (6); 5 5 0 0 tied (20); 0 0 0 0 tied (20); 7 vs 3+2+1 (1)
  assert.deepEqual(terms("kings-and-subjects", board("9155", "1100", "0073", "0021")), { kings: 6 + 20 + 20 + 1, zeros: 6, primes: 5, corners: 15 });
});

test("Stepping Stones: the biggest group joined by hops of exactly 2", () => {
  assert.equal(main("stepping-stones", board("1313", "3131", "1313", "3131")), 16);
  assert.equal(main("stepping-stones", board("0200", "0000", "4000", "0000")), 4);   // 0 2 0 on top and the 0 under the 2
  assert.equal(main("stepping-stones", board("5555", "5555", "5555", "5555")), 1, "equal neighbours never join");
});

test("Mountain Climb: cells on the longest +1 climb from the top-left", () => {
  assert.equal(main("mountain-climb", board("0123", "7654", "8000", "9000")), 10);
  assert.equal(main("mountain-climb", board("3400", "0500", "0000", "0000")), 3);
  assert.equal(main("mountain-climb", board("9000", "0000", "0000", "0000")), 1, "a climb holds at least its start");
});

test("Uphill: rising steps toward the dealt corner", () => {
  assert.equal(main("uphill", board("0123", "1234", "2345", "3456"), { corner: "BR" }), 24);
  assert.equal(main("uphill", board("0123", "1234", "2345", "3456"), { corner: "TL" }), 0);
  const s = board("0123", "0000", "0000", "0000");
  assert.deepEqual((["BR", "TL", "TR", "BL"] as const).map(corner => main("uphill", s, { corner })), [3, 3, 6, 0]);
  assert.equal(main("uphill", board("5555", "5555", "5555", "5555"), { corner: "BR" }), 0, "an equal step is no rise");
});

test("Staircase: numbers exactly 1 more than the one before", () => {
  assert.equal(main("staircase", board("0123", "0123", "0123", "0123"), { direction: "right" }), 12);
  assert.equal(main("staircase", board("0123", "0123", "0123", "0123"), { direction: "down" }), 0);
  assert.equal(main("staircase", board("1245", "3333", "0000", "0000"), { direction: "right" }), 2);
  assert.equal(main("staircase", board("1245", "3333", "0000", "0000"), { direction: "down" }), 1);
  assert.equal(main("staircase", board("9012", "0000", "0000", "0000"), { direction: "right" }), 2, "9 to 0 is no step");
});

test("Magic Accountant: how far each line's total is from T", () => {
  const s = board("9900", "0990", "4545", "3366");
  assert.equal(main("magic-accountant", s, { axis: "rows", T: 18 }), 0);
  assert.equal(main("magic-accountant", s, { axis: "columns", T: 18 }), 2 + 8 + 1 + 7);   // columns 16, 26, 19, 11
  assert.equal(main("magic-accountant", s, { axis: "columns", T: 15 }), 1 + 11 + 4 + 4);
  assert.equal(main("magic-accountant", board("0000", "0000", "0000", "0000"), { axis: "rows", T: 21 }), 84);
});

test("Fillomino: cells in patches whose size is their number; 0-patches never count", () => {
  assert.equal(main("fillomino", board("4444", "1221", "4444", "1221")), 16);
  assert.equal(main("fillomino", board("0000", "0000", "3330", "1000")), 3 + 1);
  assert.equal(main("fillomino", board("2222", "0000", "0000", "0000")), 0, "four 2s is the wrong size");
  assert.equal(main("fillomino", board("0000", "0000", "0000", "0000")), 0);
});
