/** The shared number rule (2 decimal places) and the ladder's "1 in N by chance" wording. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chanceText, fmtBits, fmtEnergy, fmtNum } from "../src/format.ts";

test("every measure reads with 2 decimal places, grouped, a true minus, never −0.00", () => {
  assert.equal(fmtNum(4.2449), "4.24");
  assert.equal(fmtNum(12), "12.00");
  assert.equal(fmtNum(1234.5), "1,234.50");
  assert.equal(fmtNum(-1.234), "−1.23");
  assert.equal(fmtNum(-0.001), "0.00");
  assert.equal(fmtNum(Number.NaN), "0.00");
  assert.equal(fmtBits(3.4), "3.40 bits");
  assert.equal(fmtBits(1), "1.00 bit");
  assert.equal(fmtEnergy(600), "600.00 ⚡");
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
});
