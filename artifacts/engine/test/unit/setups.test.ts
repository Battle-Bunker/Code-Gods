/**
 * The seed setups against the server's settings domain (convex/engine/settingsDomain.ts): every seed is valid, offered
 * and already canonical, so seeding stores exactly what the settings model would produce. What would break: a seed on
 * an instantiation the calibration tables no longer offer, or excluding a family its board cannot deal (an entry the
 * configuration page could never show or restore).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SEED_SETUPS, applySettingsChange, validateSettings } from "@workspace/game-core";
import { shippedManifest } from "@workspace/game-utilities/calibration-data";
import { settingsDomain } from "../../convex/engine/settingsDomain.ts";

const SETTINGS_DOMAIN = settingsDomain(shippedManifest());

test("every seed setup is valid, offered and canonical for the settings model", () => {
  for (const s of SEED_SETUPS) {
    assert.doesNotThrow(() => validateSettings(s.settings), s.seedId);
    assert.ok(SETTINGS_DOMAIN.offered(s.settings.objectType).some(a => JSON.stringify(a) === JSON.stringify(s.settings.typeArgs)), `${s.seedId}: an offered instantiation`);
    const families = new Set(SETTINGS_DOMAIN.families(s.settings.objectType, s.settings.typeArgs, "reward"));
    assert.deepEqual(s.settings.excludedFamilies.filter(id => !families.has(id)), [], `${s.seedId}: excludes only reward families its board can deal`);
    assert.deepEqual(s.settings.excludedDefenceFamilies, [], `${s.seedId}: every defence goal allowed`);
    assert.equal(s.settings.defenceGoals, false, `${s.seedId}: defence goals stay opt-in`);
    // Re-entering every field through the model from another world lands on the seed exactly.
    const elsewhere = applySettingsChange(s.settings, { objectType: "Int" }, SETTINGS_DOMAIN);
    assert.deepEqual(applySettingsChange(elsewhere, s.settings, SETTINGS_DOMAIN), s.settings, s.seedId);
  }
});

test("the server domain offers what the manifest lists and the families of each instantiation", () => {
  assert.deepEqual(SETTINGS_DOMAIN.offered("Int"), [{ min: -2147483648, max: 2147483647 }, { min: 0, max: 9999 }]);
  assert.ok(!SETTINGS_DOMAIN.offered("Grid").some(a => a.size === 3), "3×3 is retired");
  assert.ok(SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "reward").includes("ladder_of_numbers"));
  assert.ok(!SETTINGS_DOMAIN.families("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }, "reward").includes("ladder_of_numbers"), "needs numerals");
  const defence = SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "defence");
  assert.ok(defence.length > 0 && defence.every(id => id.startsWith("hate_")), "the defence goals, apart from the rewards");
  assert.deepEqual(SETTINGS_DOMAIN.families("Int", { min: 0, max: 9999 }, "defence"), [], "Int has no defence goals");
  const typeDefence = SETTINGS_DOMAIN.typeFamilies("Grid", "defence");
  assert.equal(typeDefence.length, 8, "the eight hate_* families");
  assert.ok(typeDefence.every(id => id.startsWith("hate_")) && !SETTINGS_DOMAIN.typeFamilies("Grid", "reward").some(id => id.startsWith("hate_")));
});
