/** The forge's leave-alone control: what the player types, and what saving says (src/panes/leave-alone.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaveLine, listWords, parseNumbers } from "../src/panes/leave-alone.ts";

test("numbers typed with commas or spaces (or a #) read sorted without repeats; anything else says what is wrong", () => {
  assert.deepEqual(parseNumbers("19, 3 #3", "line"), { numbers: [3, 19] });
  assert.deepEqual(parseNumbers("  ", "line"), { numbers: [] });
  assert.deepEqual(parseNumbers("3, x", "grid"), { error: '"x" is not a grid number: type numbers like 3, 19.' });
  assert.deepEqual(parseNumbers("0", "line"), { error: '"0" is not a line number: type numbers like 3, 19.' });
});

test("the sentence names the objects in the game's noun, and the price of the one changed line", () => {
  assert.equal(listWords([3, 7, 19], "grid", "grids"), "grids 3, 7 and 19");
  assert.equal(leaveLine({ agent: "Simple", now: [], next: [3], price: 9.2, one: "line", many: "lines" }),
    "Simple will leave line 3 alone: only that part of its code changes, for 9.20 ⚡.");
  assert.equal(leaveLine({ agent: "Simple", now: [3], next: [3], price: 0, one: "grid", many: "grids" }), "Simple leaves grid 3 alone.");
  assert.equal(leaveLine({ agent: "Simple", now: [], next: [], price: 0, one: "grid", many: "grids" }), "Simple leaves no grids alone.");
});

test("a board typed in the numbers box is refused, saying where it goes (round 8b: taken as one grid number)", () => {
  const r = parseNumbers("245364645353636354", "grid");
  assert.ok("error" in r);
  assert.match(r.error, /^"245364645353636354" is not a grid number: it looks like a board, which goes in the board box/);
  assert.ok("error" in parseNumbers("1000", "line"), "no game has a line 1000");
});
