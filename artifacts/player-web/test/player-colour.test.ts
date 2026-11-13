/** One colour per player everywhere (src/sdk/player-colour.ts), and round axis ticks. What would break: a player green in one pane and blue in the next; an axis labelled with the data's own maximum. */
import test from "node:test";
import assert from "node:assert/strict";
import { SERIES, niceTicks, playerColour, playerDash, playerSlot } from "../src/sdk/player-colour.ts";

test("the viewer is always the accent colour; the others keep one slot each by roster order", () => {
  // Roster [ada, bo, cy], the viewer is bo (index 1).
  assert.deepEqual([0, 1, 2].map(i => playerSlot(i, 1)), [1, 0, 2]);
  assert.equal(playerColour(1, 1), SERIES[0]);
  assert.equal(playerColour(0, 1), SERIES[1]);
  assert.equal(playerColour(2, 1), SERIES[2]);
  assert.equal(playerDash(1, 1), "");
  // The viewer first in the roster: the others follow in order.
  assert.deepEqual([0, 1, 2].map(i => playerSlot(i, 0)), [0, 1, 2]);
  // A spectator (no viewer among the players): plain roster order.
  assert.deepEqual([0, 1, 2].map(i => playerSlot(i, -1)), [0, 1, 2]);
  assert.deepEqual([0, 1, 2].map(i => playerSlot(i, undefined)), [0, 1, 2]);
  // More players than colours: the others wrap among the non-accent slots, never onto the viewer's.
  assert.ok(Array.from({ length: 20 }, (_, i) => i).filter(i => i !== 3).every(i => playerSlot(i, 3) !== 0));
});

test("axis ticks are round numbers, not the data's own maximum", () => {
  assert.deepEqual(niceTicks(0, 2382), [0, 1000, 2000]);
  assert.deepEqual(niceTicks(0, 593.8), [0, 200, 400]);
  assert.deepEqual(niceTicks(-120, 480), [0, 200, 400]);
  assert.deepEqual(niceTicks(-300, 300), [-200, 0, 200]);
  assert.deepEqual(niceTicks(0, 9), [0, 5]);
  assert.deepEqual(niceTicks(5, 5), [5]);
});
