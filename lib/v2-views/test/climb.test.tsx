/** @jsxRuntime automatic */
/** The climb on one object (src/climb.tsx): who moved it, up or down for you and for the others, together or undoing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ClimbHistory, climbOf, climbSentence, type ClimbMove } from "../src/index.ts";

const step = (by: string, bits: [number, number], want: [number, number]): ClimbMove =>
  ({ by, before: { rarityBits: bits[0], want: want[0], points: bits[0] * want[0] }, after: { rarityBits: bits[1], want: want[1], points: bits[1] * want[1] } });

test("moves that raise both sides climb together", () => {
  const c = climbOf([step("you", [2, 2.5], [3, 3.5]), step("Ada", [2.5, 3], [3.5, 3.5]), step("you", [3, 3.2], [3.5, 4])]);
  assert.equal(c.kind, "together");
  assert.deepEqual(c.with, ["Ada"]);
  assert.equal(climbSentence(c, "line", 4), "Line 4: you and Ada climbed together, every move raising the points: your points 6.00 → 12.80 points.");
});

test("moves that go up for one side and down for the other, then back, undo each other", () => {
  const c = climbOf([step("you", [2, 3], [4, 3]), step("Ada", [3, 2], [3, 4]), step("you", [2, 3], [4, 3]), step("Ada", [3, 2], [3, 4])]);
  assert.equal(c.kind, "undoing");
  assert.equal(climbSentence(c, "grid", 2), "Grid 2: you and Ada undid each other's moves: it changed hands 3 times; your points 8.00 → 8.00 points.");
  // The tick's own count, when the summary has it, is the one said (round 33: two counts of one tug).
  assert.match(climbSentence(c, "grid", 2, 40), /changed hands 40 times/);
  const html = renderToStaticMarkup(<ClimbHistory climb={c} noun="grid" />);
  assert.match(html, /data-kind="undoing"/);
  assert.equal((html.match(/data-testid="climb-step"/g) ?? []).length, 4);
  assert.match(html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'"), /Ada's agent you down 1.00 bits · the others up 1.00 bits/);
  assert.match(html, /Stuck: these moves undo each other/);
});

test("only your own agents: alone; nothing moved: no history", () => {
  assert.equal(climbOf([step("you", [1, 2], [1, 1])]).kind, "alone");
  assert.equal(renderToStaticMarkup(<ClimbHistory climb={climbOf([])} noun="line" />), "");
});

test("up and down moves that still climbed far are mixed, not undone; three players are named in a list", () => {
  const c = climbOf([step("you", [1, 3], [2, 1]), step("Ada", [3, 2], [1, 5]), step("Bo", [2, 4], [5, 4]), step("Ada", [4, 3.5], [4, 6])]);
  assert.equal(c.kind, "mixed", "points 2 → 21: the moves did not cancel out");
  assert.match(climbSentence(c, "grid", 5), /^Grid 5: you, Ada and Bo moved it 4 times, some moves up for you and some down: your points 2\.00 → 21\.00 points\.$/);
});
