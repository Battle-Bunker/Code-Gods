import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS, SETTINGS_OPTIONS, MAX_AGENTS_PER_GOD, settingsOptionsFor, validateSettings,
  instantiationOf, codecOf, assertObjectValue, defaultSettingsFor, SETTINGS_PRESETS, presetSettings, type GameSettings,
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
  assert.equal(DEFAULT_SETTINGS.defenceRate, 0);
  assert.equal(DEFAULT_SETTINGS.grammarId, "python-agent-v1");
  assert.equal(DEFAULT_SETTINGS.complexityFunctionId, "ast-bits-v1");
  assert.equal(DEFAULT_SETTINGS.stepBudget, 500000);
  assert.equal(DEFAULT_SETTINGS.perActFloorBits, 2);
  assert.equal(defaultSettingsFor("Int", "typescript").complexityFunctionId, "ts-ast-bits-v1-uniform");
  assert.equal(DEFAULT_SETTINGS.objectType, "Int");
  assert.deepEqual(DEFAULT_SETTINGS.typeArgs, { min: -2147483648, max: 2147483647 });
  for (const legacy of ["intMin", "intMax", "stringMaxLength"]) assert.ok(!(legacy in DEFAULT_SETTINGS));
});

test("numeric settings are validated", () => {
  for (const patch of [
    { halfLifeSeconds: 0 }, { spawnRateHz: NaN }, { pauseSeconds: 0 }, { startingEnergy: -1 },
    { startingObjectCount: 1.5 }, { agentEnergyPerSecond: -1 }, { agentEnergyPerSecond: Infinity },
    { agentBatteryActs: 0.5 }, { agentBatteryActs: NaN }, { maxAgentsPerGod: 0 }, { maxAgentsPerGod: 201 },
    { maxAgentsPerGod: 2.5 }, { penaltyWeight: -0.1 }, { penaltyWeight: NaN }, { defenceRate: 1.01 },
    { defenceRate: -0.5 }, { spawnFunctionId: "biased" as "uniform" },
  ] as Partial<GameSettings>[]) {
    assert.throws(() => validateSettings(settings(patch)), JSON.stringify(patch));
  }
  for (const patch of [
    { agentEnergyPerSecond: 0 }, { agentBatteryActs: 1 }, { maxAgentsPerGod: 1 }, { penaltyWeight: 0 },
    { penaltyWeight: 0.25 }, { defenceRate: 1 }, { defenceRate: 0.3 },
  ] as Partial<GameSettings>[]) {
    assert.doesNotThrow(() => validateSettings(settings(patch)), JSON.stringify(patch));
  }
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

test("every authored option is accepted with its compatible language and type", () => {
  for (const language of ["python", "typescript"] as const) {
    for (const objectType of ["Int", "string", "Grid"]) {
      const base = defaultSettingsFor(objectType, language);
      for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
        const options = settingsOptionsFor(key, language, objectType);
        assert.ok(options.length > 0, `${key} ${language} ${objectType}`);
        for (const option of options) {
          assert.doesNotThrow(() => validateSettings({ ...base, grammarId: settingsOptionsFor("grammarId", language, objectType)[0].id as GameSettings["grammarId"], [key]: option.id }));
        }
      }
    }
  }
});

test("unknown identifiers, cross-language grammars and old grammar ids are rejected", () => {
  for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
    assert.throws(() => validateSettings(settings({ [key]: "custom-arbitrary-id" })), /Unsupported/);
  }
  assert.throws(() => validateSettings(settings({ language: "typescript" })), /Unsupported grammarId/);
  validateSettings(settings({ language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" }));
  assert.throws(() => validateSettings(settings({ complexityFunctionId: "ast-bytes-v1" })), /Unsupported complexityFunctionId/);
  assert.throws(() => validateSettings(settings({ stepBudget: 0 })), /stepBudget/);
  assert.throws(() => validateSettings(settings({ perActFloorBits: -1 })), /perActFloorBits/);
  assert.throws(() => validateSettings(settings({ grammarId: "python-standard-v1" as never })), /Unsupported grammarId/);
  assert.deepEqual(SETTINGS_OPTIONS.grammarId.map(o => o.id), ["python-agent-v1", "typescript-agent-v1"]);
});

test("defaultSettingsFor gives valid settings for every type and language", () => {
  for (const language of ["python", "typescript"] as const)
    for (const objectType of ["Int", "string", "Grid"]) validateSettings(defaultSettingsFor(objectType, language));
  assert.throws(() => defaultSettingsFor("Unicorn"));
  const grid = defaultSettingsFor("Grid");
  assert.equal(grid.spawnRateHz, 0.5); // tuned Grid defaults (grid-lab experiments)
  assert.equal(grid.startingObjectCount, 80);
  assert.equal(defaultSettingsFor("Int").spawnRateHz, DEFAULT_SETTINGS.spawnRateHz);
  assert.deepEqual(grid.typeArgs, { size: 4, symbols: "base10", colours: "rgb" }); // beginner board
  assert.ok(grid.excludedFamilies.includes("sudoku_scholar"));
  assert.equal(grid.agentEnergyPerSecond, 16); // provisional flat Grid income (grid-lab PR #14)
  assert.equal(defaultSettingsFor("Grid", "python", { size: 7, symbols: "cards", colours: "rainbow6" }).agentEnergyPerSecond, 16);
  assert.equal(defaultSettingsFor("Int").agentEnergyPerSecond, 2);
  for (const p of SETTINGS_PRESETS) validateSettings(presetSettings(p.id));
  assert.equal(presetSettings("grid-first-steps").interactionRateHz, 25);
  assert.throws(() => validateSettings(settings({ excludedFamilies: ["Bad Id"] })));
});
