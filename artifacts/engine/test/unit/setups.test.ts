/**
 * The seed setups against the server's settings domain (convex/engine/settingsDomain.ts): every seed is valid, playable
 * and already canonical, so seeding stores exactly what the settings model would produce. What would break: a seed on
 * a retired instantiation, excluding a family its board cannot deal (an entry the configuration page could never show
 * or restore), or a shape refused because nobody shipped its tables (they are prepared on demand).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ONLY_SEED_IDS, ANNOTATED_BASICS_SEED_ID, ANNOTATED_COLOURS_SEED_ID, BEGINNER_POOL, SEED_SETUPS, TIERED_RULES_SEED_ID, applySettingsChange, seedSetupSettings, validateSettings } from "@workspace/game-core";
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

test("Annotated basics deals exactly the beginner pool on a numbers-only board; Annotated colours deals every family with a lens", async () => {
  const { LENSES, availableFamilies, selector, applicable, family, context } = await import("@workspace/game-utilities");
  const { instantiate, seededRng } = await import("@workspace/game-types");
  const { seedSetupSettings } = await import("@workspace/game-core");
  const annotated = new Set(LENSES.map(l => l.familyId));
  const cases = [
    { seedId: ANNOTATED_BASICS_SEED_ID, pool: new Set(BEGINNER_POOL), colours: "mono" },
    { seedId: ANNOTATED_COLOURS_SEED_ID, pool: null, colours: "rgb" },
  ];
  for (const { seedId, pool, colours } of cases) {
    const s = seedSetupSettings(seedId);
    assert.ok(SEED_SETUPS.some(x => x.seedId === seedId && x.summary.length <= 160), `${seedId}: listed among the system setups`);
    assert.equal(s.typeArgs.colours, colours, `${seedId}: board`);
    const inst = instantiate(s.objectType, s.typeArgs);
    // Every family of the pool is dealable on this shape and annotated; nothing else is (a new family must be excluded).
    const expected = pool ?? new Set([...annotated].filter(id => availableFamilies(inst, "reward").some(f => f.id === id)));
    for (const id of expected) assert.ok(annotated.has(id), `${seedId}: ${id} has a lens`);
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
  // Every beginner rule is dealt by the coloured annotated setup too.
  assert.equal(BEGINNER_POOL.length, 8);
  const colours = seedSetupSettings(ANNOTATED_COLOURS_SEED_ID);
  const coloursDealable = new Set(availableFamilies(instantiate(colours.objectType, colours.typeArgs), "reward", colours.excludedFamilies).map(f => f.id));
  for (const id of BEGINNER_POOL) assert.ok(coloursDealable.has(id), `Annotated colours deals ${id}`);
});

test("the tiered seeds: each public one has a pool and deals only tiered rules; an empty pool is refused, not dealt", async () => {
  const { availableFamilies, selector, context, paramsKey } = await import("@workspace/game-utilities");
  const { instantiate, seededRng } = await import("@workspace/game-types");
  const tiered = SEED_SETUPS.filter(s => s.settings.ruleTiers);
  assert.ok(tiered.some(s => s.seedId === TIERED_RULES_SEED_ID && !s.adminOnly), "Tiered rules is for everyone");
  for (const s of tiered) {
    const inst = instantiate(s.settings.objectType, s.settings.typeArgs), tiers = s.settings.ruleTiers!;
    const pool = availableFamilies(inst, "reward", s.settings.excludedFamilies, tiers);
    // What the server's domain says of the pool is what the dealer deals from.
    assert.deepEqual([...SETTINGS_DOMAIN.tiered!(s.settings.objectType, s.settings.typeArgs, tiers)].filter(id => !s.settings.excludedFamilies.includes(id)), pool.map(f => f.id), s.seedId);
    if (!pool.length) {
      // A setup nobody can play yet: administrators only, refused with the reason (never an error from the dealer).
      assert.ok(ADMIN_ONLY_SEED_IDS.has(s.seedId), `${s.seedId}: an empty pool is never shown to players`);
      assert.throws(() => validateSettings(s.settings, SETTINGS_DOMAIN), /Tiered rules need at least one allowed rule/, s.seedId);
      continue;
    }
    assert.doesNotThrow(() => validateSettings(s.settings, SETTINGS_DOMAIN), s.seedId);
    const allowed = new Set(pool.flatMap(f => f.tiered!(context(inst), tiers.depth, tiers.compose ?? "gated").map(p => `${f.id}${paramsKey(p)}`)));
    for (const sel of ["fair-aligned", "divine-lottery"]) for (let seed = 1; seed <= 5; seed++) {
      for (const d of selector(sel).select(inst, Math.min(3, allowed.size), seededRng(seed), { exclude: s.settings.excludedFamilies, tiers })) {
        assert.ok(allowed.has(`${d.familyId}${paramsKey(d.params)}`), `${s.seedId} ${sel}: ${d.familyId} ${paramsKey(d.params)}`);
      }
    }
  }
  assert.deepEqual(seedSetupSettings(TIERED_RULES_SEED_ID).ruleTiers, { depth: 1 });
});

test("an administrator-only system setup is hidden from everyone but administrators; the hiding follows the code, not the row", async () => {
  const { hiddenFrom } = await import("../../convex/lib/setupAccess.ts");
  const lab = [...ADMIN_ONLY_SEED_IDS][0]!;
  assert.equal(hiddenFrom({ ownerId: null, seedId: lab }, { isAdmin: false }), true);
  assert.equal(hiddenFrom({ ownerId: null, seedId: lab }, { isAdmin: true }), false);
  assert.equal(hiddenFrom({ ownerId: null, seedId: TIERED_RULES_SEED_ID }, { isAdmin: false }), false, "a public seed");
  assert.equal(hiddenFrom({ ownerId: "someone", seedId: lab }, { isAdmin: false }), false, "only the system's: a human's setup is never hidden");
  assert.equal(hiddenFrom({ ownerId: "someone", seedId: undefined }, { isAdmin: false }), false);
});
