/** The locks' words (src/panes/locks-model.ts): what a lock is, how long it lasts, what a move would break. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { breakLine, fundLine, lastsText, lockTitle } from "../src/panes/locks-model.ts";

test("a lock's title is its name, else the first comment of its program, else a plain fallback", () => {
  // Catches: a lock shown as raw code, or as an empty row, when its author gave no name.
  assert.equal(lockTitle({ title: "y-intercept is prime", language: "python", source: "def holds(o): ..." }), "y-intercept is prime");
  assert.equal(lockTitle({ language: "python", source: "\n# the gradient is -2\nreturn o.m == -2" }), "the gradient is -2");
  assert.equal(lockTitle({ language: "javascript", source: "// c at least 40\nreturn o.c >= 40" }), "c at least 40");
  assert.equal(lockTitle({ language: "javascript", source: "return o.c >= 40" }), "a lock with no description");
  // Long comments are cut, not wrapped across the row.
  assert.equal(lockTitle({ language: "python", source: `# ${"x".repeat(100)}` }).length, 60);
});

test("how long a lock lasts at its drain", () => {
  // Catches: a divide by zero shown as "Infinity", or a drained lock shown as lasting.
  assert.equal(lastsText(600, 5), "about 2 minutes");
  assert.equal(lastsText(30, 1), "about 30 seconds");
  assert.equal(lastsText(5, 10), "a few seconds");
  assert.equal(lastsText(0, 3), "drained");
  assert.equal(lastsText(40, 0), "does not drain");
  assert.equal(lastsText(7200, 1), "about 120 minutes");
});

test("a move that would break a lock says which, and what removing it costs", () => {
  // Catches: the warning arriving as an error after the press, or naming no lock.
  assert.equal(breakLine([]), null);
  assert.equal(breakLine([{ title: "the gradient is -2", removeCost: 120 }]),
    "This change breaks the lock “the gradient is -2”: removing it costs 120.00 energy.");
  assert.equal(breakLine([{ title: "a", removeCost: 10 }, { title: "b", removeCost: 30 }]),
    "This change breaks 2 locks (“a”, “b”): removing them costs 40.00 energy.");
});

test("adding or taking energy is priced before the press", () => {
  // Catches: a take larger than the lock holds, or an add the player cannot afford, offered as if it would work.
  assert.deepEqual(fundLine({ amount: 50, lockEnergy: 100, myEnergy: 80 }), { ok: true, text: "Add 50.00 energy: you keep 30.00, the lock holds 150.00." });
  assert.deepEqual(fundLine({ amount: 90, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "You have 80.00 energy." });
  // Taking energy away is paid from the taker's own balance (the owner: "with their available energy balance").
  assert.deepEqual(fundLine({ amount: -40, lockEnergy: 100, myEnergy: 80 }), { ok: true, text: "Take 40.00 energy away: it costs you 40.00 (you keep 40.00), the lock holds 60.00." });
  assert.deepEqual(fundLine({ amount: -140, lockEnergy: 100, myEnergy: 200 }), { ok: false, text: "The lock holds 100.00 energy." });
  assert.deepEqual(fundLine({ amount: -90, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "You have 80.00 energy." });
  assert.deepEqual(fundLine({ amount: 0, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "Pick an amount." });
});
