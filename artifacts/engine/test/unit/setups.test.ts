/**
 * The seed setups against the server's settings domain (convex/engine/settingsDomain.ts): every seed is valid, playable
 * and already canonical, so seeding stores exactly what the settings model would produce. What would break: a seed on
 * a retired instantiation, excluding a family its board cannot deal (an entry the configuration page could never show
 * or restore), or a shape refused because nobody shipped its tables (they are prepared on demand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ALL_SEED_SETUPS, BEGINNER_POOL, SEED_SETUPS, applySettingsChange, validateSettings } from "@workspace/game-core";
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
    // Re-entering every field through the model from another board lands on the seed exactly.
    const elsewhere = applySettingsChange(s.settings, { typeArgs: { size: 7, symbols: "cards", colours: "rainbow6" } }, SETTINGS_DOMAIN);
    assert.deepEqual(applySettingsChange(elsewhere, s.settings, SETTINGS_DOMAIN), s.settings, s.seedId);
  }
});

test("the server domain lists every playable shape, shipped tables or not, and the families of each instantiation", () => {
  // Every combination of the parameters' presets, the type's default first; tables are never a condition.
  assert.equal(SETTINGS_DOMAIN.playable("Grid").length, 4 * 4 * 4, "sizes 4–7 × four symbol sets × four colour sets (mono included)");
  assert.ok(!SETTINGS_DOMAIN.playable("Grid").some(a => a.size === 3), "3×3 is retired");
  // Every playable shape ships its tables; retired, invalid and removed ones are not playable.
  const shipped = new Set(offeredInstantiations(shippedManifest(), "Grid").map(i => i.key));
  assert.ok(playableInstantiations("Grid").every(i => shipped.has(i.key)), "every Grid shape has a shipped file");
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Grid", { size: 3, symbols: "base10", colours: "rgb" }), false);
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Grid", { size: 5, symbols: "base10", colours: "plaid" }), false);
  assert.equal(SETTINGS_DOMAIN.isPlayable!("Int", { min: 0, max: 9999 }), false, "the integer type is gone");
  assert.deepEqual(SETTINGS_DOMAIN.playable("Int"), [], "a type that no longer exists lists nothing");
  assert.ok(SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "reward").includes("ladder_of_numbers"));
  assert.ok(!SETTINGS_DOMAIN.families("Grid", { size: 7, symbols: "cards", colours: "rainbow6" }, "reward").includes("ladder_of_numbers"), "needs numerals");
  const defence = SETTINGS_DOMAIN.families("Grid", { size: 5, symbols: "base10", colours: "rgby" }, "defence");
  assert.ok(defence.length > 0 && defence.every(id => id.startsWith("hate_")), "the defence goals, apart from the rewards");
  const typeDefence = SETTINGS_DOMAIN.typeFamilies("Grid", "defence");
  assert.equal(typeDefence.length, 8, "the eight hate_* families");
  assert.ok(typeDefence.every(id => id.startsWith("hate_")) && !SETTINGS_DOMAIN.typeFamilies("Grid", "reward").some(id => id.startsWith("hate_")));
});

test("every setup (Annotated basics, its bidding twin and that twin's Lab variants) deals exactly the beginner pool on a numbers-only board", async () => {
  const { LENSES, availableFamilies, selector, applicable, family, context } = await import("@workspace/game-utilities");
  const { instantiate, seededRng } = await import("@workspace/game-types");
  const { seedSetupSettings } = await import("@workspace/game-core");
  const annotated = new Set(LENSES.map(l => l.familyId));
  const expected = new Set(BEGINNER_POOL);
  assert.equal(BEGINNER_POOL.length, 8);
  for (const id of expected) assert.ok(annotated.has(id), `${id} has a lens`);
  for (const { seedId, summary } of ALL_SEED_SETUPS) {
    const s = seedSetupSettings(seedId);
    assert.ok(summary.length <= 160, `${seedId}: a one-line summary`);
    assert.equal(s.typeArgs.colours, "mono", `${seedId}: board`);
    const inst = instantiate(s.objectType, s.typeArgs);
    // Every family of the pool is dealable on this shape; nothing else is (a new family must be excluded).
    const dealable = availableFamilies(inst, "reward", s.excludedFamilies).map(f => f.id).sort();
    assert.deepEqual(dealable, [...expected].sort(), seedId);
    for (const id of expected) {
      const f = family(id)!;
      assert.ok(!f.needs || applicable(f, inst, f.sample(seededRng(1), context(inst))).ok, `${id} applicable`);
    }
    // Dealing with either selector never yields anything else.
    for (const sel of ["fair-aligned", "divine-lottery"]) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const d of selector(sel).select(inst, 4, seededRng(seed), { exclude: s.excludedFamilies })) {
          assert.ok(expected.has(d.familyId), `${seedId} ${sel}: ${d.familyId}`);
        }
      }
    }
  }
});
