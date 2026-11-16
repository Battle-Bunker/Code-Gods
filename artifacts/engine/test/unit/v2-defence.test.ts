/**
 * Defence goals on the server (v1, restored; owner-decisions call 1; lib/v2-valuation defence.ts): a seat dealt a
 * penalty holds v1's signed bits n = s⁺ − w·(η(h) − E_π η(h)) on each object, and points are n × max(0, others).
 * Without defence goals nothing changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridType, grid4 } from "@workspace/v2-grid";
import { defenceNet, hinge, ruleKey } from "@workspace/v2-valuation";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";
import { penaltyMean, valueRecord } from "../../convex/v2/values.ts";
import { valueOf, valuesOf, type SeatRule } from "../../convex/v2/world.ts";

const pool = dealablePool(presetOf("grids-beginner"));
const [a, b] = [pool[0]!, pool.find(r => r.family !== pool[0]!.family)!];
const hate3 = { family: "hated-number", params: { value: 3 }, ruleKey: ruleKey(gridType as never, grid4, "hated-number", { value: 3 }, "none") };
const crowd = { family: "number-crowd", params: {}, ruleKey: ruleKey(gridType as never, grid4, "number-crowd", {}, "none") };
const board = (cells: number[]) => ({ cells });
const typical = board([1, 5, 2, 8, 0, 3, 9, 4, 7, 6, 2, 5, 1, 8, 3, 0]);
const threes = board(Array(16).fill(3));
const N = 30;

test("every penalty of the grid has a value function, and E_π η is a small positive constant", () => {
  for (const d of [hate3, crowd]) {
    assert.ok(valueRecord(d.ruleKey), d.family);
    const m = penaltyMean(d.ruleKey);
    assert.ok(m > 0 && m < 2, `${d.family}: ${m}`);
  }
});
