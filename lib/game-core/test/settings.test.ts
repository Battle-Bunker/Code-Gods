import assert from "node:assert/strict";
import test from "node:test";
import { COST_MODELS } from "@workspace/game-types";
import {
  DEFAULT_SETTINGS, SETTINGS_OPTIONS, MAX_AGENTS_PER_GOD, settingsOptionsFor, validateSettings, LANGUAGES, LANGUAGE_SPECS,
  grammarFor, complexityFor, allowedLanguages, upgradeLegacyLanguage,
  upgradeStoredSettings, FIRST_STEPS_SEED_ID, ANNOTATED_BASICS_SEED_ID, DEFAULT_SETUP_SEED_ID,
  costModelOf, supportedCostModels, OPTIONAL_SETTINGS_FIELDS,
  instantiationOf, codecOf, assertObjectValue, defaultSettingsFor, SEED_SETUPS, SETUP_NAME_MAX, seedSetupSettings, ENERGY_LIMITS, type GameSettings,
} from "../src/settings.ts";
import { gameEndSeconds } from "../src/random.ts";

const settings = (patch: Partial<GameSettings>): GameSettings => ({ ...DEFAULT_SETTINGS, ...patch });

test("defaults: timing as before, plus agent economy and scoring knobs", () => {
  validateSettings(settings({}));
  assert.equal(DEFAULT_SETTINGS.planningSeconds, 60);
  assert.equal(DEFAULT_SETTINGS.halfLifeSeconds, 300);
  assert.equal(DEFAULT_SETTINGS.pauseSeconds, 180);
  assert.equal(DEFAULT_SETTINGS.startingEnergy, 200);
  assert.equal(DEFAULT_SETTINGS.powerPerSecond, 8);
  assert.equal(DEFAULT_SETTINGS.startingObjectCount, 10);
  assert.equal(DEFAULT_SETTINGS.spawnRateHz, 0.1);
  assert.equal(DEFAULT_SETTINGS.interactionRateHz, 100);
  assert.equal(DEFAULT_SETTINGS.interactionComputeMs, 1000);
  assert.equal(DEFAULT_SETTINGS.maxAgentsPerGod, 200);
  assert.equal(MAX_AGENTS_PER_GOD, 200);
  assert.equal(DEFAULT_SETTINGS.penaltyWeight, 1);
  assert.equal(DEFAULT_SETTINGS.defenceGoals, false);
  assert.deepEqual(DEFAULT_SETTINGS.excludedDefenceFamilies, []);
  assert.ok(!("defenceRate" in DEFAULT_SETTINGS), "defence goals are a switch, not a per-player probability");
  assert.deepEqual(DEFAULT_SETTINGS.languages, ["python"]);
  for (const legacy of ["language", "grammarId", "complexityFunctionId"]) assert.ok(!(legacy in DEFAULT_SETTINGS), `${legacy} is derived from each agent's language`);
  assert.equal(DEFAULT_SETTINGS.stepBudget, 500000);
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
    { startingObjectCount: 1.5 }, { powerPerSecond: -1 }, { powerPerSecond: Infinity },
    { powerPerSecond: NaN }, { maxAgentsPerGod: 0 }, { maxAgentsPerGod: 201 },
    { maxAgentsPerGod: 2.5 }, { penaltyWeight: -0.1 }, { penaltyWeight: NaN }, { defenceGoals: 1 as never },
    { defenceGoals: "yes" as never }, { excludedDefenceFamilies: ["Bad Id"] }, { excludedDefenceFamilies: "hate_red" as never },
    { spawnFunctionId: "biased" as "uniform" },
  ] as Partial<GameSettings>[]) {
    assert.throws(() => validateSettings(settings(patch)), JSON.stringify(patch));
  }
  for (const patch of [
    { powerPerSecond: 0 }, { maxAgentsPerGod: 1 }, { penaltyWeight: 0 },
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
  assert.throws(() => validateSettings(settings({ powerPerSecond: -1 })), /powerPerSecond/);
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
  assert.deepEqual(allowedLanguages({ languages: ["haskell", "python"] }), ["python"], "a removed language is dropped (ended games keep it)");
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
  assert.deepEqual(grid.typeArgs, { size: 4, symbols: "base10", colours: "rgb" }); // beginner board
  assert.ok(grid.excludedFamilies.includes("sudoku_scholar") && grid.excludedFamilies.includes("fair_weaver"));
  const classic = defaultSettingsFor("Grid", ["python"], { size: 5, symbols: "base10", colours: "rgby" });
  assert.equal(classic.excludedFamilies.length, 11); // weak families, every Grid board
  for (const attractor of ["snap", "full_house", "bullseye", "flush_royale", "pinwheel", "stripe_painter"])
    assert.ok(!classic.excludedFamilies.includes(attractor));
  assert.equal(grid.powerPerSecond, 64); // two agents at the measured Grid income (grid-lab PR #14 §4.9)
  assert.equal(defaultSettingsFor("Grid", ["python"], { size: 7, symbols: "cards", colours: "rainbow6" }).powerPerSecond, 64);
  assert.equal(defaultSettingsFor("Int").powerPerSecond, 8);
  for (const s of SEED_SETUPS) { validateSettings(s.settings); assert.ok(s.name.length <= SETUP_NAME_MAX, s.name); }
  assert.deepEqual(SEED_SETUPS.map(s => s.seedId), ["grid-first-steps", "grid-annotated-basics", "grid-classic", "grid-low-income", "grid-big", "grid-master"]);
  assert.equal(seedSetupSettings("grid-first-steps").interactionRateHz, 25);
  assert.deepEqual(seedSetupSettings("grid-classic"), { ...classic, interactionRateHz: 100 }, "Classic is the tuned 5×5 board, complete");
  assert.ok(!seedSetupSettings("grid-master").excludedFamilies.includes("ladder_of_numbers"), "cards cannot deal it, so it is not listed");
  assert.throws(() => seedSetupSettings("nope"), /Unknown seed setup/);
  assert.throws(() => validateSettings(settings({ excludedFamilies: ["Bad Id"] })));
});

test("duration mode and the time bounds are validated server-side", () => {
  assert.equal(DEFAULT_SETTINGS.durationMode, "halfLife");
  for (const patch of [
    { durationMode: "random" as never }, { durationMode: undefined as never }, { halfLifeSeconds: 0.5 }, { halfLifeSeconds: 1_000_000_001 },
    { planningSeconds: 3601 }, { pauseSeconds: 3601 }, { pauseSeconds: 0 }, { scoreIntervalSeconds: 0 }, { scoreIntervalSeconds: 3601 },
    { scoreIntervalSeconds: 7.5 }, { scoreIntervalSeconds: NaN },
  ] as Partial<GameSettings>[]) assert.throws(() => validateSettings(settings(patch)), JSON.stringify(patch));
  for (const patch of [
    { durationMode: "fixed" as const, halfLifeSeconds: 600 }, { halfLifeSeconds: 1 }, { scoreIntervalSeconds: 7 }, { scoreIntervalSeconds: 1 },
    { planningSeconds: 0 }, { pauseSeconds: 45 }, { interactionRateHz: 3 },
  ] as Partial<GameSettings>[]) assert.doesNotThrow(() => validateSettings(settings(patch)), JSON.stringify(patch));
});

test("gameEndSeconds: fixed ends exactly on time without drawing; half-life draws the random lifetime", () => {
  let draws = 0;
  assert.equal(gameEndSeconds("fixed", 600, () => { draws++; return 0.5; }), 600);
  assert.equal(draws, 0);
  assert.ok(Math.abs(gameEndSeconds("halfLife", 300, () => 0.5) - 300) < 1e-9, "a draw of one half is one half-life");
  assert.throws(() => gameEndSeconds("fixed", 0, () => 0.5));
});

test("upgradeStoredSettings gives stored settings without a duration mode the half-life mode, keeping their value", () => {
  const { durationMode: _m, ...old } = { ...DEFAULT_SETTINGS, halfLifeSeconds: 777 };
  assert.deepEqual(upgradeStoredSettings(old)?.durationMode, "halfLife");
  assert.equal(upgradeStoredSettings(old)?.halfLifeSeconds, 777);
  assert.equal(upgradeStoredSettings({ ...old, durationMode: "fixed" }), null, "idempotent");
});

// Haskell was removed (2026-11): stored rooms and setups that allowed it must still validate.
test("upgradeStoredSettings drops the removed Haskell language, falling back to TypeScript when none is left", () => {
  const upgraded = (languages: unknown) => upgradeStoredSettings({ ...DEFAULT_SETTINGS, languages })?.languages;
  assert.deepEqual(upgraded(["python", "haskell"]), ["python"]);
  assert.deepEqual(upgraded(["haskell"]), ["typescript"]);
  const { languages: _l, ...rest } = DEFAULT_SETTINGS;
  assert.deepEqual(upgradeStoredSettings({ ...rest, language: "haskell", grammarId: "haskell-agent-v1" })?.languages, ["typescript"], "the single-language shape too");
  assert.doesNotThrow(() => validateSettings(upgradeStoredSettings({ ...DEFAULT_SETTINGS, languages: ["haskell"] }) as never));
  assert.equal(upgradeStoredSettings({ ...DEFAULT_SETTINGS, languages: ["python", "typescript"] }), null, "idempotent");
});

test("First steps and Annotated basics are 10 minutes fixed", () => {
  for (const id of [FIRST_STEPS_SEED_ID, ANNOTATED_BASICS_SEED_ID]) {
    const s = seedSetupSettings(id);
    assert.equal(s.durationMode, "fixed"); assert.equal(s.halfLifeSeconds, 600);
    assert.doesNotThrow(() => validateSettings(s));
  }
  assert.equal(seedSetupSettings("grid-classic").durationMode, "halfLife");
});

test("Annotated basics starts with 10 objects, spawns 0.1 per second and plans for 5 minutes", () => {
  const s = seedSetupSettings(ANNOTATED_BASICS_SEED_ID);
  assert.deepEqual([s.startingObjectCount, s.spawnRateHz, s.planningSeconds], [10, 0.1, 300]);
  assert.doesNotThrow(() => validateSettings(s));
});

test("energy settings have upper bounds, so no allowed value overflows an account or a score (balance harness)", () => {
  // Unbounded before: 1e308 bits/s passed, then every settlement threw "Energy overflow"; a weight of 1e308 made netBits −Infinity.
  for (const key of ["powerPerSecond", "startingEnergy", "penaltyWeight"] as const) {
    const { max } = ENERGY_LIMITS[key];
    assert.doesNotThrow(() => validateSettings(settings({ [key]: max })));
    assert.throws(() => validateSettings(settings({ [key]: max * 2 })), new RegExp(key));
    assert.throws(() => validateSettings(settings({ [key]: 1e308 })), new RegExp(key));
  }
  for (const seed of SEED_SETUPS) assert.doesNotThrow(() => validateSettings(seed.settings));
});

test("the default setup (Annotated basics) is the numbers-only 4×4 board; First steps keeps its colours", () => {
  const s = seedSetupSettings(DEFAULT_SETUP_SEED_ID);
  assert.equal(DEFAULT_SETUP_SEED_ID, ANNOTATED_BASICS_SEED_ID);
  assert.deepEqual(s.typeArgs, { size: 4, symbols: "base10", colours: "mono" });
  assert.doesNotThrow(() => validateSettings(s));
  assert.deepEqual(seedSetupSettings(FIRST_STEPS_SEED_ID).typeArgs, { size: 4, symbols: "base10", colours: "rgb" });
});

test("the cost model is optional: absent reads as set-v1, and distance-v1 is offered only where the object type supports it", () => {
  assert.ok(!("costModel" in DEFAULT_SETTINGS), "stored settings need no migration: the default is never spelled out");
  assert.deepEqual([...OPTIONAL_SETTINGS_FIELDS], ["costModel"]);
  assert.equal(costModelOf(DEFAULT_SETTINGS), "set-v1");
  assert.equal(costModelOf({ costModel: "distance-v1" }), "distance-v1");
  for (const odd of [null, undefined, {}, { costModel: "free" }, { costModel: 1 }]) assert.equal(costModelOf(odd as never), "set-v1");
  const grid = defaultSettingsFor("Grid", ["python"], { size: 4, symbols: "base10", colours: "mono" });
  assert.deepEqual(COST_MODELS.slice(0, 2), ["set-v1", "distance-v1"]);
  // Which further models a Grid offers is the type's own business (game-types supportsCostModel): the default comes first.
  const cards = defaultSettingsFor("Grid", ["python"], { size: 7, symbols: "cards", colours: "rainbow6" });
  for (const g of [grid, cards]) {
    const offered = supportedCostModels(g);
    assert.deepEqual(offered.slice(0, 2), ["set-v1", "distance-v1"]);
    assert.ok(offered.every(m => COST_MODELS.includes(m)));
    for (const model of COST_MODELS) {
      if (offered.includes(model)) assert.doesNotThrow(() => validateSettings({ ...g, costModel: model }), model);
      else assert.throws(() => validateSettings({ ...g, costModel: model }), /is not offered for Grid\(/, model);
    }
  }
  for (const type of ["Int", "string"]) assert.deepEqual(supportedCostModels(defaultSettingsFor(type)), ["set-v1"], type);
  for (const ok of [grid, { ...grid, costModel: "set-v1" }, { ...grid, costModel: "distance-v1" }, { ...DEFAULT_SETTINGS, costModel: "set-v1" }] as GameSettings[]) {
    assert.doesNotThrow(() => validateSettings(ok), JSON.stringify(ok.costModel));
  }
  assert.throws(() => validateSettings({ ...grid, costModel: "free" as never }), /costModel must be one of set-v1, distance-v1/);
  assert.throws(() => validateSettings({ ...grid, costModel: null as never }), /costModel must be one of/);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, costModel: "distance-v1" }), /costModel distance-v1 is not offered for Int\(/);
  assert.throws(() => validateSettings({ ...defaultSettingsFor("string"), costModel: "distance-v1" }), /not offered for string\(/);
});

test("only the default setup (Annotated basics) prices changes by distance; every other seed keeps the default model unspelled", () => {
  for (const s of SEED_SETUPS) {
    validateSettings(s.settings);
    if (s.seedId === DEFAULT_SETUP_SEED_ID) assert.equal(s.settings.costModel, "distance-v1");
    else assert.ok(!("costModel" in s.settings), `${s.seedId} is untouched`);
  }
  assert.equal(seedSetupSettings(DEFAULT_SETUP_SEED_ID).costModel, "distance-v1");
});
