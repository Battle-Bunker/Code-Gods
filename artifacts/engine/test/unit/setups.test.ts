/**
 * The seed setups against the server's settings domain (convex/engine/settingsDomain.ts): every seed is valid, playable
 * and already canonical, so seeding stores exactly what the settings model would produce. What would break: a seed on
 * a retired instantiation, excluding a family its board cannot deal (an entry the configuration page could never show
 * or restore), or a shape refused because nobody shipped its tables (they are prepared on demand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ANNOTATED_BASICS_SEED_ID, SEED_SETUPS, applySettingsChange, validateSettings } from "@workspace/game-core";
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
  assert.equal(SETTINGS_DOMAIN.playable("Grid").length, 4 * 4 * 4, "sizes 4–7 × four symbol sets × four colour sets (mono included)");
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

test("Annotated basics deals only the families that have a lens, derived from the lens registry", async () => {
  const { LENSES, availableFamilies, selector, applicable, family, context } = await import("@workspace/game-utilities");
  const { instantiate, seededRng } = await import("@workspace/game-types");
  const { seedSetupSettings } = await import("@workspace/game-core");
  const s = seedSetupSettings(ANNOTATED_BASICS_SEED_ID);
  assert.ok(SEED_SETUPS.some(x => x.seedId === ANNOTATED_BASICS_SEED_ID && x.summary.length <= 160), "listed among the system setups");
  const inst = instantiate(s.objectType, s.typeArgs);
  // The board is numbers only (mono), so the annotated families that read colour cannot be dealt on it.
  assert.deepEqual(s.typeArgs, { size: 4, symbols: "base10", colours: "mono" });
  const annotated = new Set(LENSES.map(l => l.familyId).filter(id => availableFamilies(inst, "reward", []).some(f => f.id === id)));
  assert.deepEqual([...annotated].sort(), ["magic_accountant", "mirrormancer", "number_bonds"]);
  // Every annotated family the board can deal is dealable; nothing else is (a new family must be added to the exclusions).
  const dealable = availableFamilies(inst, "reward", s.excludedFamilies).map(f => f.id).sort();
  assert.deepEqual(dealable, [...annotated].sort());
  for (const id of annotated) {
    const f = family(id)!;
    assert.ok(!f.needs || applicable(f, inst, f.sample(seededRng(1), context(inst))).ok, `${id} applicable`);
  }
  // Dealing with either selector never yields anything else.
  for (const id of ["fair-aligned", "divine-lottery"]) {
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of selector(id).select(inst, 4, seededRng(seed), { exclude: s.excludedFamilies })) {
        assert.ok(annotated.has(d.familyId), `${id}: ${d.familyId}`);
      }
    }
  }
});
