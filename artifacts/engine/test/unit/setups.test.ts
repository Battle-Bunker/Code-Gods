/**
 * The seed setups against the server's settings domain (convex/engine/settingsDomain.ts): every seed is valid, playable
 * and already canonical, so seeding stores exactly what the settings model would produce. What would break: a seed on
 * a retired instantiation, excluding a family its board cannot deal (an entry the configuration page could never show
 * or restore), or a shape refused because nobody shipped its tables (they are prepared on demand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SEED_SETUPS, applySettingsChange, validateSettings } from "@workspace/game-core";
import { offeredInstantiations, playableInstantiations } from "@workspace/game-utilities";
import { shippedManifest } from "@workspace/game-utilities/calibration-data";
import { settingsDomain } from "../../convex/engine/settingsDomain.ts";

const SETTINGS_DOMAIN = settingsDomain();

test("every seed setup is valid, playable and canonical for the settings model", () => {
  for (const s of SEED_SETUPS) {
    assert.doesNotThrow(() => validateSettings(s.settings), s.seedId);
    assert.ok(SETTINGS_DOMAIN.playable(s.settings.objectType).some(a => JSON.stringify(a) === JSON.stringify(s.settings.typeArgs)), `${s.seedId}: a listed instantiation`);
    const families = new Set(SETTINGS_DOMAIN.families(s.settings.objectType, s.settings.typeArgs, "reward"));
    assert.deepEqual(s.settings.excludedFamilies.filter(id => !families.has(id)), [], `${s.seedId}: excludes only reward families its board can deal`);
    assert.deepEqual(s.settings.excludedDefenceFamilies, [], `${s.seedId}: every defence goal allowed`);
    assert.equal(s.settings.defenceGoals, false, `${s.seedId}: defence goals stay opt-in`);
    // Re-entering every field through the model from another world lands on the seed exactly.
    const elsewhere = applySettingsChange(s.settings, { objectType: "Int" }, SETTINGS_DOMAIN);
    assert.deepEqual(applySettingsChange(elsewhere, s.settings, SETTINGS_DOMAIN), s.settings, s.seedId);
  }
});

test("the server domain lists every playable shape, shipped tables or not, and the families of each instantiation", () => {
  // Every combination of the parameters' presets, the type's default first; tables are never a condition.
  assert.deepEqual(SETTINGS_DOMAIN.playable("Int"), [{ min: -2147483648, max: 2147483647 }, { min: -2147483648, max: 9999 }, { min: 0, max: 2147483647 }, { min: 0, max: 9999 }]);
  assert.deepEqual(SETTINGS_DOMAIN.playable("string"), [{ maxLength: 128 }, { maxLength: 16 }]);
  assert.equal(SETTINGS_DOMAIN.playable("Grid").length, 4 * 4 * 3, "sizes 4–7 × four symbol sets × three colour sets");
  assert.ok(!SETTINGS_DOMAIN.playable("Grid").some(a => a.size === 3), "3×3 is retired");
  const shipped = new Set(offeredInstantiations(shippedManifest(), "Int").map(i => i.key));
  assert.ok(playableInstantiations("Int").some(i => !shipped.has(i.key)), "an Int range with no shipped file is playable");
  // Unlisted but valid arguments are playable; retired and invalid ones are not.
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Int", { min: 5, max: 100 }), true);
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Grid", { size: 3, symbols: "base10", colours: "rgb" }), false);
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Int", { min: 100, max: 5 }), false);
  assert.ok(SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "reward").includes("ladder_of_numbers"));
  assert.ok(!SETTINGS_DOMAIN.families("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }, "reward").includes("ladder_of_numbers"), "needs numerals");
  const defence = SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "defence");
  assert.ok(defence.length > 0 && defence.every(id => id.startsWith("hate_")), "the defence goals, apart from the rewards");
  assert.deepEqual(SETTINGS_DOMAIN.families("Int", { min: 0, max: 9999 }, "defence"), [], "Int has no defence goals");
  const typeDefence = SETTINGS_DOMAIN.typeFamilies("Grid", "defence");
  assert.equal(typeDefence.length, 8, "the eight hate_* families");
  assert.ok(typeDefence.every(id => id.startsWith("hate_")) && !SETTINGS_DOMAIN.typeFamilies("Grid", "reward").some(id => id.startsWith("hate_")));
});
