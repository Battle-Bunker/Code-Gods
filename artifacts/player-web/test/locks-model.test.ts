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
  // Catches: an add or take the player cannot afford offered as if it would work, or a take of everything refused.
  assert.deepEqual(fundLine({ amount: 50, lockEnergy: 100, myEnergy: 80 }), { ok: true, text: "Add 50.00 energy: you keep 30.00, the lock holds 150.00." });
  assert.deepEqual(fundLine({ amount: 90, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "You have 80.00 energy." });
  // Taking energy away is paid from the taker's own balance (the owner: "with their available energy balance").
  assert.deepEqual(fundLine({ amount: -40, lockEnergy: 100, myEnergy: 80 }), { ok: true, text: "Take 40.00 energy away: it costs you 40.00 (you keep 40.00), the lock holds 60.00." });
  // More than it holds takes all of it (the lock drains while the player types, so "all" cannot be typed exactly).
  assert.deepEqual(fundLine({ amount: -140, lockEnergy: 100, myEnergy: 200 }), { ok: true, text: "Take all 100.00 energy away: it costs you 100.00 (you keep 100.00), and the lock ends." });
  assert.deepEqual(fundLine({ amount: -90, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "You have 80.00 energy." });
  assert.deepEqual(fundLine({ amount: 0, lockEnergy: 100, myEnergy: 80 }), { ok: false, text: "Pick an amount." });
});

test("costly signalling: what went into a lock beyond the viewer's own, in plain words", async () => {
  // Catches: a player unable to tell whether an ally paid in more than they did (the owner's purpose for locks).
  const { shareLine } = await import("../src/panes/locks-model.ts");
  assert.equal(shareLine({ added: 12, taken: 0, mine: { added: 5, taken: 0 } }), "12 energy went in, 5 of it yours: the others put in 7.");
  assert.equal(shareLine({ added: 5, taken: 0, mine: { added: 5, taken: 0 } }), "5 energy went in, all of it yours.");
  assert.equal(shareLine({ added: 8, taken: 3, mine: { added: 0, taken: 0 } }), "8 energy went in, none of it yours; 3 was taken out.");
  assert.equal(shareLine({ added: 12, taken: 4, mine: { added: 5, taken: 0 } }), "12 energy went in, 5 of it yours: the others put in 7; 4 was taken out.");
});
