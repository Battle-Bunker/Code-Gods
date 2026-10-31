/**
 * The setups-v2 settings conversion (convex/lib/migrateSetups.ts). What would break: a room that dealt defence goals
 * at any rate coming back with them off (or one that never did with them on), an excluded defence family dropped or
 * left among the reward exclusions, or a second run changing migrated settings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { migrateSettings } from "../../convex/lib/migrateSetups.ts";

const DEFENCE = new Set(["hate_red", "hate_rows"]);
const legacy = { language: "python", penaltyWeight: 2, excludedFamilies: ["sudoku_scholar", "hate_red", "odds_evens"] };

test("a positive defence rate turns defence goals on for everyone; excluded defence ids move to their own list", () => {
  assert.deepEqual(migrateSettings({ ...legacy, defenceRate: 0.25 }, DEFENCE), {
    language: "python", penaltyWeight: 2, defenceGoals: true,
    excludedFamilies: ["sudoku_scholar", "odds_evens"], excludedDefenceFamilies: ["hate_red"],
  });
  assert.equal(migrateSettings({ ...legacy, defenceRate: 1 }, DEFENCE)!.defenceGoals, true);
});

test("a zero rate is off; the conversion is idempotent", () => {
  const off = migrateSettings({ ...legacy, defenceRate: 0 }, DEFENCE)!;
  assert.equal(off.defenceGoals, false);
  assert.ok(!("defenceRate" in off));
  assert.equal(migrateSettings(off, DEFENCE), null, "already migrated: nothing to do");
  assert.equal(migrateSettings(null, DEFENCE), null);
});
