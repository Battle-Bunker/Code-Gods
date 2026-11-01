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
    languages: ["python"], penaltyWeight: 2, defenceGoals: true,
    excludedFamilies: ["sudoku_scholar", "odds_evens"], excludedDefenceFamilies: ["hate_red"], scoreIntervalSeconds: 10, peerNoiseBits: 8,
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

test("a single stored language becomes the allowed set of that one language; its derived grammar and price ids go", () => {
  const current = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8 };
  const single = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform",
    defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8 };
  const migrated = migrateSettings(single, DEFENCE)!;
  assert.deepEqual(migrated, { ...current, languages: ["typescript"] });
  assert.equal(migrateSettings(migrated, DEFENCE), null, "idempotent");
  assert.equal(migrateSettings(current, DEFENCE), null, "settings in the current shape are left alone");
});

test("settings stored before the scoreboard interval and disclosure noise existed get their defaults; chosen values are kept", () => {
  const current = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [] };
  assert.deepEqual(migrateSettings(current, DEFENCE), { ...current, scoreIntervalSeconds: 10, peerNoiseBits: 8 });
  assert.deepEqual(migrateSettings({ ...current, scoreIntervalSeconds: 30 }, DEFENCE), { ...current, scoreIntervalSeconds: 30, peerNoiseBits: 8 });
  assert.equal(migrateSettings({ ...current, scoreIntervalSeconds: 30, peerNoiseBits: 0 }, DEFENCE), null, "nothing to change: idempotent");
});
