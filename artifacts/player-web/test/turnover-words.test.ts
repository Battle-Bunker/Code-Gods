/**
 * Line turnover's words in the app (src/panes/turnover-words.ts): the rule said once above the lines, a new line's
 * mark, and a retired line's banked points.
 *
 * What would break: a note that misstates the rule (dropped points called kept), a "new" mark that never goes away
 * or marks the starting lines, a banked figure for the wrong line state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bankedWords, isNewLine, turnoverNote } from "../src/panes/turnover-words.ts";

const word = { one: "line", many: "lines", One: "Line" };

test("the turnover note says the cap, the pace and what happens to a retired line's points", () => {
  assert.equal(turnoverNote({ liveCap: 5, banked: true, birthSeconds: 30 }, word),
    "At most 5 lines are live. A new line arrives every 30 s. Once 5 are live, each new line retires the oldest: its points stay in your total.");
  assert.equal(turnoverNote({ liveCap: 3, banked: false, birthSeconds: null }, word),
    "At most 3 lines are live. Once 3 are live, each new line retires the oldest: its points leave your total.");
  assert.equal(turnoverNote(null, word), null);
});

test("a line is new for its first 30 world seconds; the starting lines never are", () => {
  assert.equal(isNewLine(60, 75), true);
  assert.equal(isNewLine(60, 90), false);
  assert.equal(isNewLine(0, 5), false, "a starting line");
  assert.equal(isNewLine(60, null), false, "not live");
});

test("a retired line says when it retired and the points it banked for you", () => {
  assert.equal(bankedWords({ retiredAt: 125, points: 42.25 }, true), "retired at 2:05 · banked 42.25 points");
  assert.equal(bankedWords({ retiredAt: 60, points: 10 }, false), "retired at 1:00 · 10.00 points, no longer counted");
  // While the game runs the figure is as the player last saw it (paid looks, blurred sums): never called banked.
  assert.equal(bankedWords({ retiredAt: 60, points: 10 }, true, true), "retired at 1:00 · about 10.00 points as you last saw it");
});
