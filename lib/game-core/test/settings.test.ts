import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS, SETTINGS_OPTIONS, MAX_AGENTS_PER_GOD, settingsOptionsFor, validateSettings, LANGUAGES, LANGUAGE_SPECS,
  grammarFor, complexityFor, allowedLanguages, upgradeLegacyLanguage,
  instantiationOf, codecOf, assertObjectValue, defaultSettingsFor, SEED_SETUPS, SETUP_NAME_MAX, seedSetupSettings, type GameSettings,
} from "../src/settings.ts";

const settings = (patch: Partial<GameSettings>): GameSettings => ({ ...DEFAULT_SETTINGS, ...patch });

test("defaults: timing as before, plus agent economy and scoring knobs", () => {
  validateSettings(settings({}));
  assert.equal(DEFAULT_SETTINGS.planningSeconds, 60);
  assert.equal(DEFAULT_SETTINGS.halfLifeSeconds, 300);
  assert.equal(DEFAULT_SETTINGS.pauseSeconds, 180);
  assert.equal(DEFAULT_SETTINGS.startingEnergy, 100);
  assert.equal(DEFAULT_SETTINGS.energyPerSecond, 1);
  assert.equal(DEFAULT_SETTINGS.startingObjectCount, 10);
  assert.equal(DEFAULT_SETTINGS.spawnRateHz, 0.1);
  assert.equal(DEFAULT_SETTINGS.interactionRateHz, 100);
  assert.equal(DEFAULT_SETTINGS.interactionComputeMs, 1000);
  assert.equal(DEFAULT_SETTINGS.agentEnergyPerSecond, 2);
  assert.equal(DEFAULT_SETTINGS.agentBatteryActs, 2);
  assert.equal(DEFAULT_SETTINGS.maxAgentsPerGod, 200);
  assert.equal(MAX_AGENTS_PER_GOD, 200);
  assert.equal(DEFAULT_SETTINGS.penaltyWeight, 1);
  assert.equal(DEFAULT_SETTINGS.defenceGoals, false);
  assert.deepEqual(DEFAULT_SETTINGS.excludedDefenceFamilies, []);
  assert.ok(!("defenceRate" in DEFAULT_SETTINGS), "defence goals are a switch, not a per-player probability");
  assert.deepEqual(DEFAULT_SETTINGS.languages, ["python"]);
  for (const legacy of ["language", "grammarId", "complexityFunctionId"]) assert.ok(!(legacy in DEFAULT_SETTINGS), `${legacy} is derived from each agent's language`);
  assert.equal(DEFAULT_SETTINGS.stepBudget, 500000);
  assert.equal(DEFAULT_SETTINGS.perActFloorBits, 2);
  assert.equal(DEFAULT_SETTINGS.commitClause, false);
  assert.equal(DEFAULT_SETTINGS.objectSelection, "uniform");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, objectSelection: "salient" as never }), /objectSelection/);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, commitClause: "yes" as never }), /commitClause/);
  assert.deepEqual(defaultSettingsFor("Int", ["typescript"]).languages, ["typescript"]);
  assert.equal(DEFAULT_SETTINGS.objectType, "Int");
  assert.deepEqual(DEFAULT_SETTINGS.typeArgs, { min: -2147483648, max: 2147483647 });
  for (const legacy of ["intMin", "intMax", "stringMaxLength"]) assert.ok(!(legacy in DEFAULT_SETTINGS));
});

test("numeric settings are validated", () => {
  for (const patch of [
    { halfLifeSeconds: 0 }, { spawnRateHz: NaN }, { pauseSeconds: 0 }, { startingEnergy: -1 },
    { startingObjectCount: 1.5 }, { agentEnergyPerSecond: -1 }, { agentEnergyPerSecond: Infinity },
    { agentBatteryActs: 0.5 }, { agentBatteryActs: NaN }, { maxAgentsPerGod: 0 }, { maxAgentsPerGod: 201 },
    { maxAgentsPerGod: 2.5 }, { penaltyWeight: -0.1 }, { penaltyWeight: NaN }, { defenceGoals: 1 as never },
    { defenceGoals: "yes" as never }, { excludedDefenceFamilies: ["Bad Id"] }, { excludedDefenceFamilies: "hate_red" as never },
    { spawnFunctionId: "biased" as "uniform" },
  ] as Partial<GameSettings>[]) {
    assert.throws(() => validateSettings(settings(patch)), JSON.stringify(patch));
  }
  for (const patch of [
    { agentEnergyPerSecond: 0 }, { agentBatteryActs: 1 }, { maxAgentsPerGod: 1 }, { penaltyWeight: 0 },
    { penaltyWeight: 0.25 }, { defenceGoals: true }, { defenceGoals: true, excludedDefenceFamilies: ["hate_red"] },
  ] as Partial<GameSettings>[]) {
    assert.doesNotThrow(() => validateSettings(settings(patch)), JSON.stringify(patch));
  }
});

test("defence goals on with every defence family excluded is refused when the families are known", () => {
  const families = (_t: string, _a: unknown, role: "reward" | "defence") => (role === "defence" ? ["hate_red", "hate_blue"] : ["stripes"]);
  const domain = { playable: () => [], families, typeFamilies: (_t: string, role: "reward" | "defence") => families("", {}, role) };
  assert.doesNotThrow(() => validateSettings(settings({ defenceGoals: true, excludedDefenceFamilies: ["hate_red"] }), domain));
  assert.throws(() => validateSettings(settings({ defenceGoals: true, excludedDefenceFamilies: ["hate_red", "hate_blue"] }), domain),
    /at least one defence goal/);
  assert.doesNotThrow(() => validateSettings(settings({ defenceGoals: false, excludedDefenceFamilies: ["hate_red", "hate_blue"] }), domain),
    "off: the checklist has no effect");
  assert.throws(() => validateSettings(settings({ defenceGoals: true }), { ...domain, families: () => [] }), /at least one defence goal/,
    "an instantiation with no defence families cannot deal defence goals");
});

test("interaction compute budget is an integer from 1 to 1000 ms; interaction cap is 1000 Hz", () => {
  for (const interactionComputeMs of [1, 5, 1000]) validateSettings(settings({ interactionComputeMs }));
  for (const interactionComputeMs of [0, -1, 1.5, 1001, NaN, Infinity]) {
    assert.throws(() => validateSettings(settings({ interactionComputeMs })), /interactionComputeMs/);
  }
  for (const interactionRateHz of [0, 10, 100, 999.5, 1000]) validateSettings(settings({ interactionRateHz }));
  for (const interactionRateHz of [1000.1, -1, Infinity, NaN]) {
    assert.throws(() => validateSettings(settings({ interactionRateHz })), /interactionRateHz/);
  }
});

test("typeArgs are validated by the object type's instantiate", () => {
  validateSettings(settings({ objectType: "Int", typeArgs: { min: 0, max: 9 } }));
  validateSettings(settings({ objectType: "string", typeArgs: { maxLength: 128 } }));
  validateSettings(settings({ objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" } }));
  for (const [objectType, typeArgs] of [
    ["Int", { min: 10, max: 1 }],
    ["Int", { min: 0.5, max: 2 }],
    ["string", { maxLength: -1 }],
    ["Grid", { size: 5, symbols: "base10", colours: "plaid" }],
    ["Unicorn", {}],
  ] as const) {
    assert.throws(() => validateSettings(settings({ objectType, typeArgs })), `${objectType} ${JSON.stringify(typeArgs)}`);
  }
  assert.throws(() => validateSettings(settings({ typeArgs: null as never })), /typeArgs/);
  assert.equal(instantiationOf(settings({ objectType: "Int", typeArgs: { min: 0, max: 9 } })).objectType, "Int");
  const grid = instantiationOf(settings({ objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" } }));
  assert.equal(grid.key, "Grid(5,base10,rgby)");
});

test("object values are checked by the type's codec, never coerced", () => {
  for (const x of [-2147483648, 0, 2147483647]) assertObjectValue(x, DEFAULT_SETTINGS);
  for (const x of [true, 0.5, "1", Infinity, -2147483649]) assert.throws(() => assertObjectValue(x, DEFAULT_SETTINGS));
  const small = settings({ typeArgs: { min: 0, max: 9 } });
  assertObjectValue(9, small);
  assert.throws(() => assertObjectValue(10, small));
  const strings = settings({ objectType: "string", typeArgs: { maxLength: 128 } });
  for (const x of ["", "a".repeat(128)]) assertObjectValue(x, strings);
  for (const x of ["é", "a".repeat(129), 1]) assert.throws(() => assertObjectValue(x, strings));
  const grids = settings({ objectType: "Grid", typeArgs: { size: 3, symbols: "base10", colours: "rgb" } });
  assertObjectValue("7R,3G,0B/1R,2R,9B/4G,4G,8R", grids);
  assert.throws(() => assertObjectValue("7R,3G,0B/1R,2R,9B", grids));
  assert.equal(codecOf(grids), codecOf({ ...grids, typeArgs: { colours: "rgb", size: 3, symbols: "base10" } })); // cached
});

test("every authored option is accepted with its compatible type", () => {
  for (const objectType of ["Int", "string", "Grid"]) {
    const base = defaultSettingsFor(objectType);
    for (const key of ["utilitySelectorId", "spawnFunctionId"] as const) {
      const options = settingsOptionsFor(key, objectType);
      assert.ok(options.length > 0, `${key} ${objectType}`);
      for (const option of options) assert.doesNotThrow(() => validateSettings({ ...base, [key]: option.id }));
    }
  }
});

test("unknown identifiers are rejected", () => {
  for (const key of ["utilitySelectorId", "spawnFunctionId"] as const) {
    assert.throws(() => validateSettings(settings({ [key]: "custom-arbitrary-id" })), /Unsupported/);
  }
  assert.throws(() => validateSettings(settings({ stepBudget: 0 })), /stepBudget/);
  assert.throws(() => validateSettings(settings({ perActFloorBits: -1 })), /perActFloorBits/);
  assert.deepEqual(SETTINGS_OPTIONS.spawnFunctionId.map(o => o.id), ["uniform"]);
});

test("a game allows a non-empty set of supported languages, each listed once", () => {
  validateSettings(settings({ languages: ["typescript"] }));
  validateSettings(settings({ languages: ["typescript", "python"] }));
  for (const bad of [[], ["cobol"], ["python", "python"], "python", undefined, null]) {
    assert.throws(() => validateSettings(settings({ languages: bad as never })), /languages/, JSON.stringify(bad));
  }
});

test("each language has exactly one grammar and one summon-price function, read from its one table entry", () => {
  assert.deepEqual([...LANGUAGES], Object.keys(LANGUAGE_SPECS));
  assert.deepEqual(LANGUAGES.map(grammarFor), ["python-agent-v1", "typescript-agent-v1"]);
  assert.deepEqual(LANGUAGES.map(complexityFor), ["ast-bits-v1", "ts-ast-bits-v1-uniform"]);
});

test("allowedLanguages reads the set, and a stored single language still works", () => {
  assert.deepEqual(allowedLanguages(settings({ languages: ["typescript", "python"] })), ["typescript", "python"]);
  const legacy = { ...DEFAULT_SETTINGS, languages: undefined, language: "typescript", grammarId: "typescript-agent-v1" } as never;
  assert.deepEqual(allowedLanguages(legacy), ["typescript"]);
});

test("upgradeLegacyLanguage turns a single language into the set and drops the derived ids", () => {
  const { languages: _l, ...rest } = DEFAULT_SETTINGS;
  const legacy = { ...rest, language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" };
  const upgraded = upgradeLegacyLanguage(legacy);
  assert.deepEqual(upgraded, { ...rest, languages: ["typescript"] });
  validateSettings(upgraded as GameSettings);
  assert.equal(upgradeLegacyLanguage(upgraded), null, "already upgraded: no change");
  // A stray single language beside the set is dropped, the set wins.
  assert.deepEqual(upgradeLegacyLanguage({ ...rest, languages: ["python"], language: "typescript" }), { ...rest, languages: ["python"] });
  assert.equal(upgradeLegacyLanguage(null), null);
  assert.equal(upgradeLegacyLanguage({ ...rest, languages: ["python"], grammarId: "python-agent-v1" }), null,
    "a grammar id without a language is not the old shape: validation refuses it as an unknown setting");
});

test("defaultSettingsFor gives valid settings for every type and language", () => {
  for (const language of ["python", "typescript"] as const)
    for (const objectType of ["Int", "string", "Grid"]) validateSettings(defaultSettingsFor(objectType, [language]));
  assert.throws(() => defaultSettingsFor("Unicorn"));
  const grid = defaultSettingsFor("Grid");
  assert.equal(grid.spawnRateHz, 0.5); // tuned Grid defaults (grid-lab experiments)
  assert.equal(grid.startingObjectCount, 80);
  assert.equal(defaultSettingsFor("Int").spawnRateHz, DEFAULT_SETTINGS.spawnRateHz);
  assert.deepEqual(grid.typeArgs, { size: 4, symbols: "base10", colours: "ryb" }); // beginner board
  assert.ok(grid.excludedFamilies.includes("sudoku_scholar") && grid.excludedFamilies.includes("fair_weaver"));
  // A stored rgb beginner board keeps its tuning (same structure as ryb, so the same rules are too hard there).
  const rgb4 = defaultSettingsFor("Grid", ["python"], { size: 4, symbols: "base10", colours: "rgb" }).excludedFamilies;
  assert.deepEqual(grid.excludedFamilies.filter(id => id !== "seed3_green_ones"), rgb4);
  // Green Ones is not dealt by default where there is no green (its card would say "Green Ones: count the red 1s").
  assert.ok(grid.excludedFamilies.includes("seed3_green_ones") && !rgb4.includes("seed3_green_ones"));
  assert.ok(defaultSettingsFor("Grid", ["python"], { size: 6, symbols: "cards", colours: "ryb" }).excludedFamilies.includes("seed3_green_ones"));
  assert.ok(!defaultSettingsFor("Grid", ["python"], { size: 6, symbols: "cards", colours: "rgby" }).excludedFamilies.includes("seed3_green_ones"));
  const classic = defaultSettingsFor("Grid", ["python"], { size: 5, symbols: "base10", colours: "rgby" });
  assert.equal(classic.excludedFamilies.length, 11); // weak families, every Grid board
  for (const attractor of ["snap", "full_house", "bullseye", "flush_royale", "pinwheel", "stripe_painter"])
    assert.ok(!classic.excludedFamilies.includes(attractor));
  assert.equal(grid.agentEnergyPerSecond, 32); // measured Grid income (grid-lab PR #14 §4.9)
  assert.equal(grid.perActFloorBits, 2);
  assert.equal(defaultSettingsFor("Grid", ["python"], { size: 7, symbols: "cards", colours: "rainbow6" }).agentEnergyPerSecond, 32);
  assert.equal(defaultSettingsFor("Int").agentEnergyPerSecond, 2);
  for (const s of SEED_SETUPS) { validateSettings(s.settings); assert.ok(s.name.length <= SETUP_NAME_MAX, s.name); }
  assert.deepEqual(SEED_SETUPS.map(s => s.seedId), ["grid-first-steps", "grid-classic", "grid-low-income", "grid-big", "grid-master"]);
  assert.equal(seedSetupSettings("grid-first-steps").interactionRateHz, 25);
  assert.deepEqual(seedSetupSettings("grid-first-steps").typeArgs, { size: 4, symbols: "base10", colours: "ryb" }, "red, yellow, blue");
  assert.deepEqual(seedSetupSettings("grid-classic"), { ...classic, interactionRateHz: 100 }, "Classic is the tuned 5×5 board, complete");
  assert.ok(!seedSetupSettings("grid-master").excludedFamilies.includes("ladder_of_numbers"), "cards cannot deal it, so it is not listed");
  assert.throws(() => seedSetupSettings("nope"), /Unknown seed setup/);
  assert.throws(() => validateSettings(settings({ excludedFamilies: ["Bad Id"] })));
});
