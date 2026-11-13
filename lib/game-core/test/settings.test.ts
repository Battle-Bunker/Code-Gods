import assert from "node:assert/strict";
import test from "node:test";
import { COST_MODELS } from "@workspace/game-types";
import {
  DEFAULT_SETTINGS, SETTINGS_OPTIONS, MAX_AGENTS_PER_GOD, settingsOptionsFor, validateSettings, LANGUAGES, LANGUAGE_SPECS,
  grammarFor, complexityFor, allowedLanguages, upgradeLegacyLanguage,
  upgradeStoredSettings, FIRST_STEPS_SEED_ID, ANNOTATED_BASICS_SEED_ID, ANNOTATED_BIDDING_SEED_ID, DEFAULT_SETUP_SEED_ID, TIERED_RULES_SEED_ID,
  costModelOf, supportedCostModels, OPTIONAL_SETTINGS_FIELDS,
  instantiationOf, codecOf, assertObjectValue, defaultSettingsFor, SEED_SETUPS, SETUP_NAME_MAX, seedSetupSettings, ALL_SEED_SETUPS, LAB_SETUPS, ENERGY_LIMITS, BID_PRICINGS, TIME_LIMITS, type GameSettings,
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
  assert.deepEqual(SEED_SETUPS.map(s => s.seedId), ["grid-first-steps", "grid-annotated-basics", "grid-annotated-colours", "grid-annotated-bidding", "grid-classic", "grid-low-income", "grid-big", "grid-master", "grid-tiered"]);
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

test("First steps is 10 minutes fixed; the default setup (Annotated basics) is sized for a first session: 5 minutes fixed", () => {
  // Catches: a first game nobody sees the end of (5 min of planning + 10 min of game in the first-players study).
  for (const [id, length] of [[FIRST_STEPS_SEED_ID, 600], [ANNOTATED_BASICS_SEED_ID, 300]] as const) {
    const s = seedSetupSettings(id);
    assert.equal(s.durationMode, "fixed"); assert.equal(s.halfLifeSeconds, length);
    assert.doesNotThrow(() => validateSettings(s));
  }
  assert.equal(seedSetupSettings("grid-classic").durationMode, "halfLife");
});

test("Annotated basics starts with 10 objects, spawns 0.1 per second and plans for 60 seconds", () => {
  const s = seedSetupSettings(ANNOTATED_BASICS_SEED_ID);
  assert.deepEqual([s.startingObjectCount, s.spawnRateHz, s.planningSeconds], [10, 0.1, 60]);
  assert.doesNotThrow(() => validateSettings(s));
});
test("Annotated basics is sized for a first game: five minutes with a countdown, and live points that equal the final", () => {
  const s = seedSetupSettings(ANNOTATED_BASICS_SEED_ID);
  assert.deepEqual([s.durationMode, s.halfLifeSeconds], ["fixed", 300]);
  // Disclosure noise makes every live total read high and drop at the end (the others' sum is floored after the noise).
  assert.equal(s.peerNoiseBits, 0);
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

test("tiered rules are one optional setting: absent everywhere but the tiered seeds, validated, and the other compositions are Lab setups", () => {
  assert.ok(!("ruleTiers" in DEFAULT_SETTINGS), "absent by default: a stored setup from before the field needs no migration");
  assert.ok((OPTIONAL_SETTINGS_FIELDS as readonly string[]).includes("ruleTiers"), "an optional field: a stored setup from before it needs no migration");
  // The seeds from before tiers carry no such field (their stored rows stay equal to the code, untouched).
  const tiered = Object.fromEntries(ALL_SEED_SETUPS.filter(s => "ruleTiers" in s.settings).map(s => [s.seedId, [s.settings.ruleTiers, s.lab === true]]));
  assert.deepEqual(tiered, {
    "grid-tiered": [{ depth: 1 }, false],
    "lab-tiers-plain": [{ depth: 1, compose: "plain" }, true],
    "lab-tiers-unlock": [{ depth: 1, compose: "unlock" }, true],
    "lab-tiers-expert": [{ depth: 2 }, true],
    "lab-tiers-uncapped": [{ depth: 1, compose: "uncapped" }, true],
  });
  // The tiered seed: the board and pace of Annotated basics.
  const t = seedSetupSettings("grid-tiered"), basics = seedSetupSettings("grid-annotated-basics");
  assert.deepEqual(t.typeArgs, { size: 4, symbols: "base10", colours: "mono" });
  for (const key of ["interactionRateHz", "durationMode", "halfLifeSeconds", "startingObjectCount", "spawnRateHz", "planningSeconds", "observation"] as const) assert.equal(t[key], basics[key], key);
  assert.notEqual(seedSetupSettings("grid-tiered").ruleTiers, SEED_SETUPS.find(s => s.seedId === "grid-tiered")!.settings.ruleTiers, "a fresh copy");
  // Validation: a depth of 1 or 2, at most a known composition, nothing else.
  for (const ok of [{ depth: 1 }, { depth: 2 }, { depth: 1, compose: "plain" }, { depth: 2, compose: "unlock" }, { depth: 1, compose: "uncapped" }]) {
    assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, ruleTiers: ok as never }), JSON.stringify(ok));
  }
  for (const bad of [null, 1, "gated", [], {}, { depth: 0 }, { depth: 3 }, { depth: "1" }, { depth: 1, compose: "gated" }, { depth: 1, compose: "other" }, { depth: 1, extra: true }]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ruleTiers: bad as never }), /ruleTiers must be/, JSON.stringify(bad));
  }
  // With a domain that knows which families offer tiers: an empty tiered pool is refused; one allowed family is enough.
  const domain = (offered: string[]) => ({ families: () => [], tiered: () => offered });
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ruleTiers: { depth: 2 } }, domain([])), /Tiered rules need at least one allowed rule with two tiers/);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, ruleTiers: { depth: 1 }, excludedFamilies: ["a"] }, domain(["a"])), /Tiered rules need at least one allowed rule with one tier/);
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, ruleTiers: { depth: 1 }, excludedFamilies: ["a"] }, domain(["a", "b"])));
  assert.doesNotThrow(() => validateSettings(DEFAULT_SETTINGS, domain([])), "an ordinary game asks nothing of tiers");
});

test("the cost model is optional: absent reads as set-v1, and distance-v1 is offered only where the object type supports it", () => {
  assert.ok(!("costModel" in DEFAULT_SETTINGS), "stored settings need no migration: the default is never spelled out");
  assert.deepEqual([...OPTIONAL_SETTINGS_FIELDS], ["costModel", "ruleTiers"]);
  assert.equal(costModelOf(DEFAULT_SETTINGS), "set-v1");
  assert.equal(costModelOf({ costModel: "distance-v1" }), "distance-v1");
  for (const odd of [null, undefined, {}, { costModel: "free" }, { costModel: 1 }]) assert.equal(costModelOf(odd as never), "set-v1");
  const grid = defaultSettingsFor("Grid", ["python"], { size: 4, symbols: "base10", colours: "mono" });
  assert.deepEqual(COST_MODELS.slice(0, 2), ["set-v1", "distance-v1"]);
  // Which further models a Grid offers is the type's own business (game-types supportsCostModel): the default comes first.
  const cards = defaultSettingsFor("Grid", ["python"], { size: 5, symbols: "cards", colours: "rgb" });
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

test("the setups built on Annotated basics price changes by distance; every other ordinary seed keeps the default model unspelled", () => {
  // Each of these is Annotated basics plus one thing (a bid phase, ★ tiers), so each follows the beginner board's pricing.
  const onBasics = [DEFAULT_SETUP_SEED_ID, ANNOTATED_BIDDING_SEED_ID, TIERED_RULES_SEED_ID];
  for (const s of SEED_SETUPS) {
    validateSettings(s.settings);
    if (onBasics.includes(s.seedId)) assert.equal(s.settings.costModel, "distance-v1", s.seedId);
    else assert.ok(!("costModel" in s.settings), `${s.seedId} is untouched`);
  }
  assert.equal(seedSetupSettings(DEFAULT_SETUP_SEED_ID).costModel, "distance-v1");
});

test("the Lab setups are Annotated basics under each other cost model, after the ordinary seeds", () => {
  const lab = LAB_SETUPS.filter(s => s.seedId.startsWith("lab-cost-"));
  assert.ok(lab.every(s => s.lab === true) && !SEED_SETUPS.some(s => s.seedId.startsWith("lab-")), "Lab setups are never among the ordinary seeds");
  assert.deepEqual(lab.map(s => [s.seedId, s.name, s.summary, s.settings.costModel]), [
    ["lab-cost-set", "Lab · flat price", "Annotated basics with the flat price: every changed number costs the same", undefined],
    ["lab-cost-dial", "Lab · dial numbers", "Numbers are a dial: 9 and 0 are one step apart, and a step either way costs the same", "dial-v1"],
    ["lab-cost-log", "Lab · gentle distance", "A far move costs only a little more than a middling one", "log-v1"],
    ["lab-cost-multiply", "Lab · multiply and divide", "Adds, plus multiply and divide by the last digit; a number's move costs the cheaper of the two", "multiply-v1"],
  ]);
  // Everything but the cost model is Annotated basics (the board, the rule pool, the pacing): the pool cannot drift.
  const { costModel: _basics, ...basics } = seedSetupSettings(ANNOTATED_BASICS_SEED_ID);
  for (const s of lab) {
    const { costModel, ...rest } = seedSetupSettings(s.seedId);
    assert.deepEqual(rest, basics, s.seedId);
    assert.equal("costModel" in s.settings, s.seedId !== "lab-cost-set", `${s.seedId}: set-v1 stays unspelled`);
    assert.equal(costModelOf(s.settings), costModel ?? "set-v1");
    assert.ok(supportedCostModels(s.settings).includes(costModelOf(s.settings)));
    assert.ok(s.name.length <= SETUP_NAME_MAX && s.summary.length <= 160, s.seedId);
    validateSettings(s.settings);
  }
  // Each model of COST_MODELS is tried by exactly one system setup on this board.
  const tried = [ANNOTATED_BASICS_SEED_ID, ...lab.map(s => s.seedId)].map(id => costModelOf(seedSetupSettings(id))).sort();
  assert.deepEqual(tried, ["dial-v1", "distance-v1", "log-v1", "multiply-v1", "set-v1"]);
});

test("fullChargeSeconds: a default, validated bounds, and stored room/setup settings without it get the default", () => {
  assert.equal(DEFAULT_SETTINGS.fullChargeSeconds, 30);
  for (const seed of SEED_SETUPS) assert.equal(seed.settings.fullChargeSeconds, 30, seed.seedId);
  for (const bad of [0, 0.5, -1, NaN, Infinity, 1_000_001, "30"]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, fullChargeSeconds: bad as number }), /fullChargeSeconds/, String(bad));
  }
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, fullChargeSeconds: 1 }));
  assert.doesNotThrow(() => validateSettings({ ...DEFAULT_SETTINGS, fullChargeSeconds: 12.5 }));
  const { fullChargeSeconds: _, ...old } = DEFAULT_SETTINGS;
  assert.equal(upgradeStoredSettings(old)?.fullChargeSeconds, 30);
  assert.equal(upgradeStoredSettings({ ...old, fullChargeSeconds: 120 }), null, "a chosen value is kept");
});

test("upgradeStoredSettings leaves a started game's economy alone: no capacity is added to a game that had none", () => {
  const { fullChargeSeconds: _, ...old } = DEFAULT_SETTINGS;
  assert.equal(upgradeStoredSettings(old, true), null);
  const { scoreIntervalSeconds: __, ...older } = old;
  assert.deepEqual(upgradeStoredSettings(older, true), old, "its other fields are still filled");
});

test("the settings of a game started before fullChargeSeconds existed still validate (it is examined and summoned into)", () => {
  const { fullChargeSeconds: _, ...old } = DEFAULT_SETTINGS;
  assert.doesNotThrow(() => validateSettings(old as GameSettings));
});

test("the bid phase settings: off by default, whole seconds from 0 to 600, a first or second price", () => {
  assert.equal(DEFAULT_SETTINGS.bidSeconds, 0, "no bid phase unless the owner asks for one");
  assert.equal(DEFAULT_SETTINGS.bidPricing, "first");
  // Only "Basics with bidding" has a bid phase (45 s); the default setup and every other system setup have none.
  for (const seed of SEED_SETUPS) assert.deepEqual([seed.settings.bidSeconds, seed.settings.bidPricing], [seed.seedId === ANNOTATED_BIDDING_SEED_ID ? 45 : 0, "first"], seed.seedId);
  assert.notEqual(DEFAULT_SETUP_SEED_ID, ANNOTATED_BIDDING_SEED_ID);
  const { bidSeconds: _b, ...basics } = seedSetupSettings(ANNOTATED_BASICS_SEED_ID), { bidSeconds: _c, ...withBids } = seedSetupSettings(ANNOTATED_BIDDING_SEED_ID);
  assert.deepEqual(withBids, basics, "the bidding setup is Annotated basics with a bid phase and nothing else");
  // The Lab alternatives differ from it in exactly one bid setting each.
  const variants = LAB_SETUPS.filter(s => s.seedId.startsWith("lab-bidding-")).map(s => {
    const base = seedSetupSettings(ANNOTATED_BIDDING_SEED_ID) as unknown as Record<string, unknown>, mine = s.settings as unknown as Record<string, unknown>;
    return Object.keys(base).filter(k => JSON.stringify(base[k]) !== JSON.stringify(mine[k])).map(k => `${k}=${String(mine[k])}`).join();
  });
  assert.deepEqual(variants, ["bidPricing=second", "bidVisibility=open", "bidDisclosure=handicaps", "bidDisclosure=all"]);
  assert.deepEqual(TIME_LIMITS.bidSeconds, { min: 0, max: 600 });
  for (const ok of [0, 1, 30, 600]) assert.doesNotThrow(() => validateSettings(settings({ bidSeconds: ok })), String(ok));
  for (const bad of [601, 1.5, -1, NaN, Infinity, "30", null]) {
    assert.throws(() => validateSettings(settings({ bidSeconds: bad as number })), /bidSeconds/, String(bad));
  }
  assert.deepEqual(BID_PRICINGS, ["first", "second"]);
  for (const ok of BID_PRICINGS) assert.doesNotThrow(() => validateSettings(settings({ bidSeconds: 30, bidPricing: ok })));
  for (const bad of ["third", "", 1, null]) {
    assert.throws(() => validateSettings(settings({ bidPricing: bad as never })), /bidPricing/, String(bad));
  }
});

test("stored room and setup settings from before the bid phase get none (0, first price); a started game is left without the fields and still validates", () => {
  const { bidSeconds: _s, bidPricing: _p, bidVisibility: _v, bidDisclosure: _d, ...older } = DEFAULT_SETTINGS;
  assert.deepEqual(upgradeStoredSettings(older), { ...older, bidSeconds: 0, bidPricing: "first", bidVisibility: "sealed", bidDisclosure: "private" });
  for (const bad of ["public", "", 1]) {
    assert.throws(() => validateSettings(settings({ bidVisibility: bad as never })), /bidVisibility/);
    assert.throws(() => validateSettings(settings({ bidDisclosure: bad as never })), /bidDisclosure/);
  }
  for (const v of ["sealed", "open"] as const) for (const d of ["private", "handicaps", "all"] as const) assert.doesNotThrow(() => validateSettings(settings({ bidSeconds: 30, bidVisibility: v, bidDisclosure: d })));
  const old = { ...older, bidVisibility: "sealed", bidDisclosure: "private" };
  assert.deepEqual(upgradeStoredSettings(old), { ...old, bidSeconds: 0, bidPricing: "first" });
  assert.deepEqual(upgradeStoredSettings(old), DEFAULT_SETTINGS);
  assert.equal(upgradeStoredSettings({ ...old, bidSeconds: 30, bidPricing: "second" }), null, "chosen values are kept");
  assert.deepEqual(upgradeStoredSettings({ ...old, bidSeconds: 30 }), { ...old, bidSeconds: 30, bidPricing: "first" }, "each field is filled by itself");
  assert.equal(upgradeStoredSettings(old, true), null, "a game already started had no bid phase: nothing is added");
  assert.doesNotThrow(() => validateSettings(old as GameSettings));
});

test("Lab setups: complete, valid, marked, with ids and names of their own, and never the default or among the system setups", () => {
  const ids = ALL_SEED_SETUPS.map(s => s.seedId), names = ALL_SEED_SETUPS.map(s => s.name.toLowerCase());
  assert.equal(new Set(ids).size, ids.length, "seed ids are unique across the system and Lab setups");
  assert.equal(new Set(names).size, names.length, "and so are names (the picker shows both to an administrator)");
  assert.deepEqual(ALL_SEED_SETUPS, [...SEED_SETUPS, ...LAB_SETUPS], "the system's first: Lab setups never shift a system setup's position");
  assert.ok(SEED_SETUPS.every(s => !s.lab), "no system setup is marked Lab");
  for (const s of LAB_SETUPS) {
    assert.equal(s.lab, true, s.seedId);
    assert.match(s.seedId, /^lab-[a-z0-9-]+$/, `${s.seedId}: a Lab seed id starts with "lab-"`);
    assert.ok(s.name.length <= SETUP_NAME_MAX && s.summary.length > 0 && s.summary.length <= 160, s.seedId);
    assert.doesNotThrow(() => validateSettings(s.settings), s.seedId);
    assert.deepEqual(seedSetupSettings(s.seedId), { ...s.settings }, s.seedId);
  }
  assert.ok(!LAB_SETUPS.some(s => s.seedId === DEFAULT_SETUP_SEED_ID), "a new room never starts on a Lab setup");
});

/**
 * A beginner's first minutes on the default setup (owner, 11 Nov 2026: "we still want to motivate simpler agents";
 * coordinator, 13 Nov: every shipped Python example must be payable in planning, a second agent within about a minute).
 * Hand-derived for Annotated basics: P = 64 bits/s, T = 30 s, starting energy 600.
 */
test("the default setup: the dearest example agent is payable in planning, and again within a minute of the world starting", async () => {
  const { BEGINNER_AGENT_BUDGET_BITS } = await import("../src/settings.ts");
  const { chargeDeityAccount, settleDeityEnergy, defaultShare, energyCapacity, deityIncome } = await import("../src/energy.ts");
  const s = SEED_SETUPS.find(x => x.seedId === DEFAULT_SETUP_SEED_ID)!.settings;
  assert.deepEqual([s.powerPerSecond, s.fullChargeSeconds, s.startingEnergy, BEGINNER_AGENT_BUDGET_BITS], [64, 30, 600, 572]);
  // Planning: world time is stopped, nothing accrues; the store with nothing allocated (1,920) holds the starting energy.
  const terms = (allocated: number) => ({ powerPerSecond: s.powerPerSecond, allocated, fullChargeSeconds: s.fullChargeSeconds });
  let own = settleDeityEnergy({ balance: s.startingEnergy, settledWorldSeconds: 0 }, 0, terms(0));
  assert.equal(own.balance, 600, "none of the starting energy is lost to the capacity");
  own = chargeDeityAccount(own, BEGINNER_AGENT_BUDGET_BITS, 0, terms(0));
  assert.equal(own.balance, 28);
  // The first summon takes the default share, half: the god keeps 32 bits/s and holds at most 960.
  const allocated = defaultShare(0);
  assert.deepEqual([allocated, deityIncome(64, allocated), energyCapacity(deityIncome(64, allocated), 30)], [0.5, 32, 960]);
  // The same agent again: (572 − 28) / 32 = 17 s of world time.
  assert.throws(() => chargeDeityAccount(own, BEGINNER_AGENT_BUDGET_BITS, 16.9, terms(allocated)), /Insufficient/);
  assert.doesNotThrow(() => chargeDeityAccount(own, BEGINNER_AGENT_BUDGET_BITS, 17, terms(allocated)));
  assert.equal(settleDeityEnergy(own, 60, terms(allocated)).balance, 960, "a full store within the first minute");
  // Code size still matters: that agent is 15% of the god's whole first minute of power (572 of 3,840 bits), and a
  // program over 960 bits cannot be bought at all while half the power is with an agent.
  assert.ok(BEGINNER_AGENT_BUDGET_BITS / (64 * 60) > 0.1);
  assert.throws(() => chargeDeityAccount(own, 961, 3600, terms(allocated)), /Insufficient/);
  // Every Grid setup starts the same way; other worlds keep the general default.
  for (const seed of SEED_SETUPS.filter(x => x.settings.objectType === "Grid")) assert.equal(seed.settings.startingEnergy, 600, seed.seedId);
  assert.equal(DEFAULT_SETTINGS.startingEnergy, 200);
});

test("every world's defaults keep the starting energy: the store holds it in planning and after the first default summons", async () => {
  const { settleDeityEnergy, chargeDeityAccount, defaultShare } = await import("../src/energy.ts");
  for (const type of ["Int", "string", "Grid"]) {
    const s = defaultSettingsFor(type);
    const terms = (allocated: number) => ({ powerPerSecond: s.powerPerSecond, allocated, fullChargeSeconds: s.fullChargeSeconds });
    let own = settleDeityEnergy({ balance: s.startingEnergy, settledWorldSeconds: 0 }, 0, terms(0)), allocated = 0;
    assert.equal(own.balance, s.startingEnergy, `${type}: the planning store (${s.powerPerSecond} × ${s.fullChargeSeconds}) holds the starting energy`);
    // Two small agents (60 bits each, a one-move agent) at the default shares: a half, then a quarter.
    for (const left of [s.startingEnergy - 60, s.startingEnergy - 120]) {
      own = chargeDeityAccount(own, 60, 0, terms(allocated));
      allocated += defaultShare(allocated);
      own = settleDeityEnergy(own, 0, terms(allocated));
      // Grid (600 bits, P = 64): 540 then 480 = its quarter-power store exactly. Int and string (200 bits, P = 8, T = 60): 140, 80.
      assert.equal(own.balance, left, `${type}: nothing is lost to the capacity with ${100 * allocated}% allocated`);
    }
  }
  assert.deepEqual([defaultSettingsFor("Int").fullChargeSeconds, defaultSettingsFor("string").fullChargeSeconds, defaultSettingsFor("Grid").fullChargeSeconds], [60, 60, 30]);
});

test("the summon price is language-fair: TypeScript's structure bits are weighted to Python's scale (docs/energy-model.md §5.1)", async () => {
  const { fairSummonBits } = await import("../src/settings.ts");
  assert.deepEqual([LANGUAGE_SPECS.python.structureWeight, LANGUAGE_SPECS.typescript.structureWeight], [1, 0.44]);
  // Python is unchanged.
  assert.deepEqual(fairSummonBits("python", 737.9, 420.0), { cost: 737.9, structure: 420.0 });
  // The greedy policy program (lib/game-utilities/scripts/coordination-programs): TypeScript inspection 1,319.7 bits, of
  // which 974.6 are structure. Weighted: 974.6 × 0.44 = 428.8, so 1,319.7 − 974.6 + 428.8 = 773.9 (Python: 737.9).
  const greedy = fairSummonBits("typescript", 1319.7, 974.6);
  assert.ok(Math.abs(greedy.structure - 428.824) < 1e-9 && Math.abs(greedy.cost - 773.924) < 1e-9, JSON.stringify(greedy));
  // The dearest policy (cooperator, 2,916.7 with 1,955.2 of structure) now fits a god's store of 1,920 bits: 1,821.8.
  assert.ok(Math.abs(fairSummonBits("typescript", 2916.7, 1955.2).cost - 1821.788) < 1e-9);
});
