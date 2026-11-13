/**
 * The rule score → ✨ rarity scale (src/explain/rarity-scale.ts). What would break: a scale that is not the engine's
 * bits, that is too long to read, or that leaves out the ends of the range.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rarityOf, rarityScale } from "../src/explain/rarity-scale.ts";
import type { CalibrationTable } from "../src/calibration.ts";
import type { HoldTable } from "../src/hold.ts";

const table = (levels: [number | number[], number][], slope = 1) => ({ levels, slope }) as unknown as CalibrationTable;

test("the rarity of a rule score is the table's bits, plus the game's hold correction", () => {
  const reward = table([[0, 0], [1, 1.5], [2, 4], [4, 10]]);
  assert.equal(rarityOf({ reward }, 2), 4, "at a step");
  assert.equal(rarityOf({ reward }, 3), 7, "between two steps: half way from 4 to 10");
  assert.equal(rarityOf({ reward }, 5), 11, "above the top: the slope");
  const hold = { m: 2, levels: [[1, 0.5], [2, 1]] } as unknown as HoldTable;
  assert.equal(rarityOf({ reward, hold }, 2), 5);
  assert.equal(rarityOf({ reward, hold }, 0), 0, "no hold below its lowest level");
});

test("the scale: one row per primary value, the lowest step with it", () => {
  const reward = table([[[0, -9], 0], [[0, -3], 0.4], [[1, -8], 2], [[1, -2], 3], [[2, -5], 6.4]]);
  assert.deepEqual(rarityScale({ reward }), [{ ordinal: [0, -9], bits: 0 }, { ordinal: [1, -8], bits: 2 }, { ordinal: [2, -5], bits: 6.4 }]);
});

test("a long table is cut to the ends and the steps nearest to evenly spaced rarity", () => {
  // Primary 0..10 with bits 0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30: targets for 5 rows are 0, 7.5, 15, 22.5, 30.
  const bits = [0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30];
  const reward = table(bits.map((b, i) => [i, b]));
  // Nearest to 7.5 is 5 (primary 5; 10 is equally far, the first found wins); to 15 is 15 (primary 7); to 22.5 is 20 (primary 8).
  assert.deepEqual(rarityScale({ reward }, 5).map(r => r.ordinal[0]), [0, 5, 7, 8, 10]);
  assert.equal(rarityScale({ reward }, 5).length, 5);
  assert.deepEqual(rarityScale({ reward }, 2).map(r => r.ordinal[0]), [0, 10], "always both ends");
  assert.equal(rarityScale({ reward }, 20).length, 11, "a short table is shown whole");
});
