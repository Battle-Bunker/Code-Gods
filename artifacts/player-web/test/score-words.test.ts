/**
 * How a score reads (src/core/words.ts): one number rule (2 decimal places) for bits, energy and points; one formula
 * text for a line's score ("your 4.24 bits × others' 12.03 bits = 51.01 points"); the note for a line only you care
 * about; and ranks that share on equal shown totals, with the note that says so. Expectations worked by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { energyText, isTied, num, onlyYouNote, pointsText, powerText, scoreFormula, sharedRanks, TIE_NOTE, totalNote, totalsSumNote, totalSumNote } from "../src/core/words.ts";

test("every measure a player reads has 2 decimal places, one path for bits, energy and points", () => {
  assert.equal(num(4.2449), "4.24");
  assert.equal(num(-0.004), "0.00", "never −0.00");
  assert.equal(pointsText(51.0072), "51.01 points");
  assert.equal(pointsText(1), "1.00 point");
  assert.equal(energyText(600), "600.00 ⚡");
  assert.equal(powerText(2.5), "2.50 ⚡ a second");
});

test("a line's score: your bits × the others' bits = points, the product of the full values", () => {
  // 4.24 × 12.03 = 51.0072: the shown figures multiply to the shown product, so "=".
  assert.equal(scoreFormula(4.24, 12.03), "your 4.24 bits × others' 12.03 bits = 51.01 points");
  // 4.2449 × 12.0349 = 51.0870…: shown 4.24 × 12.03 would be 51.01, but the product shown is the true one, 51.09, so "≈".
  assert.equal(scoreFormula(4.2449, 12.0349), "your 4.24 bits × others' 12.03 bits ≈ 51.09 points");
  assert.equal(scoreFormula(1, 0), "your 1.00 bit × others' 0.00 bits = 0.00 points");
});

test('"4.2 × 12.0 = 51.0" cannot appear: every figure has 2 places and "=" only when the shown figures multiply out', () => {
  // Catches: a formula built from one-decimal figures, or "=" between figures that do not multiply to the result.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 40;
  for (let i = 0; i < 2000; i++) {
    const a = rand(), b = rand();
    const m = /^your ([\d,]+\.\d\d) bits? × others' ([\d,]+\.\d\d) bits? ([=≈]) ([\d,]+\.\d\d) points?$/.exec(scoreFormula(a, b));
    assert.ok(m, scoreFormula(a, b));
    const [x, y, p] = [m[1]!, m[2]!, m[4]!].map(s => Math.round(Number(s.replace(/,/g, "")) * 100));
    assert.equal(p, Math.round(a * b * 100), "the product shown is the full-precision product, rounded");
    assert.equal(m[3] === "=", Math.round(x! * y! / 100) === p, `${scoreFormula(a, b)}: the sign says whether the shown figures multiply out`);
  }
});

test("a line only you care about says why it scores nothing", () => {
  assert.equal(onlyYouNote(4.24, 0), "Only you care about this line, so it scores nothing yet: it needs someone else to find it rare too.");
  assert.equal(onlyYouNote(4.24, 0.004), onlyYouNote(4.24, 0), "what shows as 0.00 is nobody");
  assert.equal(onlyYouNote(4.24, 2), null, "the others care: no note");
  assert.equal(onlyYouNote(0, 0), null, "you do not care either: nothing to explain about others");
});

test("a total is said to be the sum of the lines, less a won bid's share only when one applies", () => {
  // Catches: "the sum of your points on every line" beside a total that a 20% handicap made smaller.
  assert.equal(totalNote(totalsSumNote(), false), "Each total is the sum of that player's points on every line.");
  assert.equal(totalNote(totalsSumNote(), true), "Each total is the sum of that player's points on every line. A won bid's share (the −% beside a total) comes off that sum.");
});

test("equal shown totals share a place, the next place skips, and a shared place is marked tied", () => {
  const rows = [
    { memberId: "a", net: 3000, rank: 1 },
    { memberId: "b", net: 2552.701, rank: 2 },
    { memberId: "c", net: 2552.699, rank: 3 },   // both show 2,552.70
    { memberId: "d", net: 2552.69, rank: 4 },    // shows 2,552.69: its own place
  ];
  const ranked = sharedRanks(rows);
  assert.deepEqual(ranked.map(r => [r.memberId, r.rank]), [["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
  assert.deepEqual(ranked.map(r => isTied(ranked, r)), [false, true, true, false]);
  assert.equal(TIE_NOTE, "Equal totals share a place.");
});

test("others' bits are said to be every other player's bits on the line added together; a total says when it was counted", async () => {
  const { othersNote, countedNote } = await import("../src/core/words.ts");
  assert.equal(othersNote(), "Others' bits: every other player's rarity on this line, added together. A line scores when it is rare for you and for them.");
  assert.equal(countedNote(40), "Totals are counted every few seconds; this one at 0:40, so a move's points join the total at the next count.");
  assert.equal(countedNote(40, 300), "Totals are counted every few seconds; this one with 4:20 left, so a move's points join the total at the next count.");
  assert.equal(countedNote(null), null);
});

test("a rule won by bid says so during the game, with what comes off the total", async () => {
  const { bidNote } = await import("../src/core/words.ts");
  assert.equal(bidNote({ bid: 10, handicap: 10, title: "Prime Landing" }), "You won Prime Landing in the bid: 10% comes off your total at the end of the game.");
  assert.equal(bidNote({ bid: null, handicap: null, title: "Prime Landing" }), null);
});

test("every note speaks the game's own noun (ux-lessons 2.8): a grid game never says line", async () => {
  const { othersNote } = await import("../src/core/words.ts");
  const { partsNote, whyLine } = await import("../src/panes/lines.ts");
  const grid = [
    totalSumNote("grid"), totalsSumNote("grid"), othersNote("grid"), onlyYouNote(2, 0, "grid")!,
    partsNote(2, "grid", "grids")!, whyLine({ rarity: 2, want: 0 }, { worst: "no run" }, "grid"),
  ];
  for (const t of grid) { assert.match(t, /\bgrids?\b/); assert.doesNotMatch(t, /\blines?\b/, t); }
  assert.equal(totalSumNote("grid"), "Your total is the sum of your points on every grid.");
});
