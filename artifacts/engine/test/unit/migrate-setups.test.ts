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
    excludedFamilies: ["sudoku_scholar", "odds_evens"], excludedDefenceFamilies: ["hate_red"], scoreIntervalSeconds: 10, durationMode: "halfLife", fullChargeSeconds: 30, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private",
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
  const current = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8, durationMode: "halfLife", fullChargeSeconds: 30, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" };
  const single = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform",
    defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8, durationMode: "halfLife", fullChargeSeconds: 30, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" };
  const migrated = migrateSettings(single, DEFENCE)!;
  assert.deepEqual(migrated, { ...current, languages: ["typescript"] });
  assert.equal(migrateSettings(migrated, DEFENCE), null, "idempotent");
  assert.equal(migrateSettings(current, DEFENCE), null, "settings in the current shape are left alone");
});

test("settings stored before the scoreboard interval, capacity and bid phase existed get their defaults; chosen values are kept", () => {
  const current = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [] };
  const filled = { scoreIntervalSeconds: 10, durationMode: "halfLife", fullChargeSeconds: 30, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" };
  assert.deepEqual(migrateSettings(current, DEFENCE), { ...current, ...filled });
  assert.deepEqual(migrateSettings({ ...current, scoreIntervalSeconds: 30 }, DEFENCE), { ...current, ...filled, scoreIntervalSeconds: 30 });
  assert.equal(migrateSettings({ ...current, scoreIntervalSeconds: 30, peerNoiseBits: 0, durationMode: "fixed", fullChargeSeconds: 120, bidSeconds: 30, bidPricing: "second", bidVisibility: "open", bidDisclosure: "all" }, DEFENCE), null, "nothing to change: idempotent");
});

test("a game already started keeps the economy it was charged with: no capacity is added to it or to its summary", () => {
  const played = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8, durationMode: "halfLife" };
  assert.equal(migrateSettings(played, DEFENCE, true), null, "a started game without fullChargeSeconds is left without it");
  assert.equal(migrateSettings(played, DEFENCE)!.fullChargeSeconds, 30, "the same settings in a room or a setup (the next game) get the default");
  const { scoreIntervalSeconds: _, ...older } = played;
  assert.deepEqual(migrateSettings(older, DEFENCE, true), played, "its other fields are still filled");
});

test("a game already started had no bid phase: none is added to it; a room or a setup stored before the setting gets none (0, first price)", () => {
  const before = { languages: ["python"], defenceGoals: false, excludedFamilies: [], excludedDefenceFamilies: [], scoreIntervalSeconds: 10, peerNoiseBits: 8, durationMode: "halfLife", fullChargeSeconds: 30 };
  assert.equal(migrateSettings(before, DEFENCE, true), null, "a started game without the bid settings is left without them");
  assert.deepEqual(migrateSettings(before, DEFENCE), { ...before, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" });
  assert.equal(migrateSettings({ ...before, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" }, DEFENCE), null, "idempotent");
});
