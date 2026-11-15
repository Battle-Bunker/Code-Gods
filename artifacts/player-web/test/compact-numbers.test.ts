/** Very large numbers said compactly so a log line fits a phone row (playtest round 26, 07); the exact value on tap. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compactNumber, splitBigNumbers } from "../src/core/compact-numbers.ts";

test("a power of a small number reads as the power; any other big number in millions, billions, trillions", () => {
  assert.equal(compactNumber("3486784401"), "3²⁰");
  assert.equal(compactNumber("−3486784401"), "−3²⁰");
  assert.equal(compactNumber("1024"), null, "small numbers stay as they are");
  assert.equal(compactNumber("2324522934"), "2.32 billion");
  assert.equal(compactNumber("−6,973,568,802"), "−6.97 billion");
  assert.equal(compactNumber("12500000"), "12.5 million");
  assert.equal(compactNumber("4000000000000"), "4 trillion");
  assert.equal(compactNumber("1000000"), "10⁶");
  assert.equal(compactNumber("999999"), null, "below a million: as it is");
});

test("a sentence's big numbers are found with their exact text, the rest left alone", () => {
  // After an operator the minus stays the operator's ("2x − 6,973,568,802").
  const parts = splitBigNumbers("y = 2x − 6,973,568,802 → y = 2x + 59049 (1 in 1,200)");
  assert.deepEqual(parts, ["y = 2x − ", { exact: "6,973,568,802", short: "6.97 billion" }, " → y = 2x + 59049 (1 in 1,200)"]);
  assert.deepEqual(splitBigNumbers("c was −2324522934"), ["c was ", { exact: "−2324522934", short: "−2.32 billion" }]);
  assert.deepEqual(splitBigNumbers("nothing big here: 12,345"), ["nothing big here: 12,345"]);
});
