/** The shared number rule (2 decimal places) and the ladder's "1 in N by chance" wording. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chanceText, fmtBits, fmtEnergy, fmtNum, labelWithArgs } from "../src/format.ts";
import { lineType, type LineState } from "@workspace/v2-linear";
import { labelOf } from "../src/rep-view.tsx";

test("every measure reads with 2 decimal places, grouped, a true minus, never −0.00", () => {
  assert.equal(fmtNum(4.2449), "4.24");
  assert.equal(fmtNum(12), "12.00");
  assert.equal(fmtNum(1234.5), "1,234.50");
  assert.equal(fmtNum(-1.234), "−1.23");
  assert.equal(fmtNum(-0.001), "0.00");
  assert.equal(fmtNum(Number.NaN), "0.00");
  assert.equal(fmtBits(3.4), "3.40 bits");
  assert.equal(fmtBits(1), "1.00 bit");
  assert.equal(fmtEnergy(600), "600.00 energy");
});

test("1 in N by chance, N = 2^bits, rounded the way people say big numbers", () => {
  // Catches: "1 in 1024.0000" or "1 in 3435973836.8" on the ladder; a beginner reads round figures.
  assert.equal(chanceText(0), "1 in 1");
  assert.equal(chanceText(1), "1 in 2");
  assert.equal(chanceText(1.58), "1 in 3");
  assert.equal(chanceText(0.5), "1 in 1.4");
  assert.equal(chanceText(5), "1 in 32");
  assert.equal(chanceText(Math.log2(1000)), "1 in 1,000");
  assert.equal(chanceText(10), "1 in 1,000", "1,024 is said as about a thousand");
  assert.equal(chanceText(14), "1 in 16,000");
  assert.equal(chanceText(Math.log2(1.2e6)), "1 in 1.2 million");
  assert.equal(chanceText(Math.log2(34e6)), "1 in 34 million");
  assert.equal(chanceText(Math.log2(3.4e9)), "1 in 3.4 billion");
  assert.equal(chanceText(40), "1 in 1.1 trillion");
  assert.equal(chanceText(Math.log2(999.6e6)), "1 in 1 billion", "rounding up to the next word");
  assert.equal(chanceText(Math.log2(999.9)), "1 in 1,000", "rounding up to a thousand is grouped like a thousand");
  assert.doesNotMatch(chanceText(5000), /NaN|Infinity/, "a degenerate calibration still reads as a number");
  // Past a trillion, a power of ten, never digits mixed with a scale word ("2,400,000,000,000,000,000 septillion").
  assert.equal(chanceText(Math.log2(2.4e15)), "1 in 2.4 × 10¹⁵");
  assert.equal(chanceText(140.79), "1 in 2.4 × 10⁴²");
  assert.equal(chanceText(Math.log2(999e12)), "1 in 1 × 10¹⁵", "rounding up to the next power");
  for (const b of [50, 80, 100, 140.79, 300, 999]) assert.match(chanceText(b), /^1 in \d(\.\d)? × 10[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/, `${b} bits: ${chanceText(b)}`);
});

test("live, with the others' numbers blurred: the formula says about and ≈, never an exact product (v1 peerNoiseBits)", async () => {
  const { scoreFormula } = await import("../src/format.ts");
  assert.equal(scoreFormula(6.8, 2.4, true), "your 6.80 bits × others' about 2.40 bits ≈ 16.32 points");
  assert.equal(scoreFormula(6.8, 2.4), "your 6.80 bits × others' 2.40 bits = 16.32 points", "exact once the game has ended");
});

test("live, a blurred others' sum can be negative; points are never (own × max(0, sum), W3 #608)", async () => {
  const { scoreFormula } = await import("../src/format.ts");
  assert.equal(scoreFormula(6.8, -2.4, true), "your 6.80 bits × others' about 0.00 bits ≈ 0.00 points");
});

test("an element's arguments are said in its words, never as code (playtest round 26: \"whole number (q = 5, r = 4)\")", () => {
  assert.equal(labelOf<LineState>(lineType, { rep: "crossing", name: "dealt", args: { q: "5", r: "4" } }), "whole number leaving 4 when divided by 5");
  assert.equal(labelWithArgs("y when x is k", { k: "-2" }), "y when x is −2");
  assert.equal(labelWithArgs("mark", { x: "3" }), "mark (x = 3)");   // an argument the label does not name is said after it
});

test("rarer than: how many of 1,000 random objects this one beats, as v1's why? said (never rounded up to all 1,000)", async () => {
  const { rarerThanText } = await import("../src/format.ts");
  assert.equal(rarerThanText(1, "grids"), "rarer than 500 of 1,000 random grids");
  assert.equal(rarerThanText(7.2, "grids"), "rarer than 993 of 1,000 random grids");
  assert.equal(rarerThanText(40, "grids"), "rarer than 999 of 1,000 random grids");
  assert.equal(rarerThanText(0, "lines"), "rarer than 0 of 1,000 random lines");
});
