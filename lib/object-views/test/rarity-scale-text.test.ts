/** The goal card's rule score → ✨ rarity words (src/rarity-scale-text.ts). What would break: an overstated share, jargon, or a row nobody can read. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleRarityLine, rarerThanPercent, scaleRowText, sparkle, sparkleMeans, SPARKLE_MEANS } from "../src/rarity-scale-text.ts";

test("the example board's line says how rare its rule score is, and which way is up", () => {
  // ✨ 6.4: 1 − 2^−6.4 = 0.98816…
  assert.equal(exampleRarityLine([7, 2], 6.4), "This board's rule score (7, 2) is rarer than 98.8% of random boards: ✨ 6.4. A higher rule score is rarer, and rarer is worth more.");
  assert.equal(exampleRarityLine([3, -26], 9.1, "grid"), "This grid's rule score (3, −26) is rarer than 99.81% of random grids: ✨ 9.1. A higher rule score is rarer, and rarer is worth more.");
  assert.equal(exampleRarityLine([5], 1), "This board's rule score 5 is rarer than 50% of random boards: ✨ 1.0. A higher rule score is rarer, and rarer is worth more.");
  assert.equal(exampleRarityLine([0, -20], 0.02), "This board's rule score (0, −20) is common among random boards: ✨ 0. A higher rule score is rarer, and rarer is worth more.");
});

test("the share is never rounded up, and stops at 'more than 99.99%'", () => {
  assert.equal(rarerThanPercent(1), "50%");
  assert.equal(rarerThanPercent(3), "87.5%");
  assert.equal(rarerThanPercent(10), "99.9%");           // 99.902…: two places from 99 on, floored: 99.90 → "99.9"
  assert.equal(rarerThanPercent(13), "99.98%");          // 99.9877…
  assert.equal(rarerThanPercent(30.4), "more than 99.99%");
  assert.equal(rarerThanPercent(0), "0%");
});

test("a row of the scale: the primary value, how rare, its ✨", () => {
  // 2^6.4 = 84.4 → "84"; 2^15.3 = 40,342 → "40,000"; 2^30.4 = 1.417e9 → "1.4 billion".
  assert.equal(scaleRowText({ ordinal: [2, -15], bits: 6.4 }), "(2, …) 1 in 84: ✨ 6.4");
  assert.equal(scaleRowText({ ordinal: [4, -3], bits: 15.3 }), "(4, …) 1 in 40,000: ✨ 15.3");
  assert.equal(scaleRowText({ ordinal: [8, 0], bits: 30.4 }), "(8, …) 1 in 1.4 billion: ✨ 30.4");
  assert.equal(scaleRowText({ ordinal: [0, -30], bits: 0 }), "(0, …) common: ✨ 0");
  assert.equal(scaleRowText({ ordinal: [3], bits: 2 }), "3 1 in 4: ✨ 2.0");
  assert.equal(sparkle(-0.01), "0");
});

test("what ✨ means: plain words, no bits and no logarithms", () => {
  assert.equal(SPARKLE_MEANS, "✨ 10 means 1 board in about 1,000 is this good; each +1 is twice as rare.");
  assert.equal(sparkleMeans("grid"), "✨ 10 means 1 grid in about 1,000 is this good; each +1 is twice as rare.");
  assert.ok(!/bit|log/i.test(SPARKLE_MEANS));
});
