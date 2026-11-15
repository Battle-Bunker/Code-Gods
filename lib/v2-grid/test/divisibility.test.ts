/** Divisibility (divisibility.ts): readings, powers, the tie-breaker on what is left, the cards, the dealt instances (rows 3 and 4 of the rule design check). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, gridPresets, divisibilityReadings, divisibilityNumbers, powerOf, DIVISIBILITY_DEALT, type DivisibilityParams, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "divisibility")!;
const terms = (s: GridState, p: DivisibilityParams) => Object.fromEntries(evaluateSite(gridType, fam, p, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));
const digits = (s: GridState, cells: number[]) => cells.map(i => s.cells[i]).join("");
const A = board("1234", "5678", "9012", "3456");

test("readings: halves and alternate rows and columns, every cell in one row reading and one column reading", () => {
  assert.deepEqual(divisibilityReadings(4, "halves").map(c => digits(A, c)), ["12345678", "90123456", "15932604", "37154826"]);
  assert.deepEqual(divisibilityReadings(4, "alternate").map(c => digits(A, c)), ["12349012", "56783456", "15933715", "26044826"]);
  for (const layout of ["halves", "alternate"] as const) {
    const rs = divisibilityReadings(4, layout);
    assert.deepEqual([...rs[0]!, ...rs[1]!].sort((a, b) => a - b), [...Array(16).keys()]);
    assert.deepEqual([...rs[2]!, ...rs[3]!].sort((a, b) => a - b), [...Array(16).keys()]);
  }
});

test("powers and matching: the main part counts the q's dividing the numbers, less the repeated rows and columns", () => {
  assert.equal(powerOf(0, 3), 0, "a reading of all zeros counts nothing");
  assert.equal(powerOf(4782969, 3), 14);
  assert.equal(powerOf(-77777778, 2), 1);
  // 12345678 = 2 × 3² × 47 × 14593; 90123456 = 3 × …; 15932604 = 3 × …; 37154826 = 3² × …
  assert.deepEqual(divisibilityNumbers(4, { lens: "powers", q: 3, layout: "halves" }, A.cells).map(x => x.v), [2, 1, 1, 2]);
  assert.deepEqual(terms(A, { lens: "powers", q: 3, layout: "halves" }), { powers: 6, "leftover-digits": 25 + 16 + 31 + 23 });
  // Rows: 12345678 − 90123456 = −77777778 (one 2); columns: 15932604 − 37154826 = −21222222 (one 2).
  assert.equal(terms(A, { lens: "matching", q: 2, layout: "halves" }).powers, 2);
  // 3^14 = 4782969 written into the top half: 14 from one reading.
  const B = board("0478", "2969", "1234", "5678");
  assert.equal(terms(B, { lens: "powers", q: 3, layout: "halves" }).powers, 14 + 2 + 0 + 0);
  // Repeats cost: 0202 four times holds every row and column twice over (3 + 2 repeats); no reading is a multiple of 3.
  assert.equal(terms(board("0202", "0202", "0202", "0202"), { lens: "powers", q: 3, layout: "halves" }).powers, 0 - 5);
});

test("the tie-breaker reads the attained number: a step up the main part changes what is left (row 3)", () => {
  const p: DivisibilityParams = { lens: "powers", q: 3, layout: "halves" };
  // Swapping the 3 and the 4 of row 1 keeps the top half's power (12435678 = 3² × …) and lifts the right half from
  // 37154826 (3²) to 47153826 (3⁴): the main part steps up, and what is left of every changed reading is new.
  const C = board("1243", "5678", "9012", "3456");
  assert.equal(terms(C, p).powers, terms(A, p).powers + 2);
  const left = (s: GridState) => divisibilityNumbers(4, p, s.cells).map(x => x.x / 3 ** x.v);
  assert.deepEqual(left(A), [1371742, 30041152, 5310868, 4128314]);
  assert.deepEqual(left(C), [1381742, 30041152, 5310868, 582146]);
});

test("cards: one sentence each, filled in, at most four numbers; dealt: four instances, in no preset (row 4)", () => {
  assert.equal(fam.card({ lens: "powers", q: 3, layout: "halves" }, null),
    "Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number: each should be divisible by as high a power of 3 as possible (count the 3s that divide it), and no two rows or two columns may hold the same numbers.");
  assert.equal(fam.card({ lens: "matching", q: 2, layout: "alternate" }, "leftover-digits"),
    "Read the odd rows and the even rows row by row, and the odd columns and the even columns column by column, each as one number: the two row numbers should differ, and so should the two column numbers, by numbers divisible by as high a power of 2 as possible (count the 2s), and no two rows or two columns may hold the same numbers. Tie-breaker: What is left of those numbers after dividing out their 2s should have digits adding up to as much as possible.");
  assert.deepEqual(fam.dealable(grid4), [...DIVISIBILITY_DEALT]);
  assert.ok(DIVISIBILITY_DEALT.length >= 4);
  for (const p of fam.dealable(grid4)) for (const tb of [null, ...fam.tieBreakers.map(t => t.id)]) {
    const c = fam.card(p, tb);
    assert.doesNotMatch(c, /\bline\b/i, c);
    assert.ok((c.match(/\d+/g) ?? []).length <= 4, c);
  }
  for (const pr of gridPresets) for (const r of pr.rules) assert.notEqual(r.family, "divisibility", `${pr.id} deals it`);
});
