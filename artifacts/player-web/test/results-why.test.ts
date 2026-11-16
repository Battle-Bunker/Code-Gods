/** The end page's "Why: your best and worst lines" (src/panes/results-why-model.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { pointsOverGame, worstWithout } from "../src/panes/results-why-model.ts";

const move = (worldSeconds: number, before: number, after: number) => ({ worldSeconds, before: { points: before }, after: { points: after } });

test("a line's points over the game: from before its first move, after each move in time order, to the end", () => {
  assert.deepEqual(pointsOverGame([move(30, 5, 2), move(10, 0, 5)], 2, 60), [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 30, y: 2 }, { x: 60, y: 2 }]);
});

test("a line nobody moved is flat at its points; no moves and no end, nothing to draw", () => {
  assert.deepEqual(pointsOverGame([], 7, 60), [{ x: 0, y: 7 }, { x: 60, y: 7 }]);
  assert.deepEqual(pointsOverGame(undefined, undefined, undefined), []);
});

test("the worst lines leave out the best", () => {
  const best = [{ objectId: "a" }, { objectId: "b" }];
  assert.deepEqual(worstWithout([{ objectId: "b" }, { objectId: "c" }], best), [{ objectId: "c" }]);
});
