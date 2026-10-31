/**
 * The settings model (src/settings-model.ts): a change moves exactly the fields the game makes depend on it and
 * nothing else. Every expectation is written out by hand against a small hand-made domain (which instantiations are
 * offered, which families exist where), so no calibration table or tuned default leaks into these tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, type GameSettings } from "../src/settings.ts";
import { SettingsChangeError, applySettingsChange, sameSettings, type SettingsDomain } from "../src/settings-model.ts";

const INT_WIDE = { min: -2147483648, max: 2147483647 };
const INT_SMALL = { min: 0, max: 9999 };
const GRID4 = { size: 4, symbols: "base10", colours: "rgb" };
const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };

const FAMILIES: Record<string, string[]> = {
  "Int(-2147483648,2147483647)": ["parity", "digits"],
  "Int(0,9999)": ["parity", "digits", "small"],
  "string(128)": ["vowels"],
  "Grid(4,base10,rgb)": ["stripes", "corners", "frames"],
  "Grid(5,base10,rgby)": ["stripes", "corners", "ladders"],
  "Grid(7,cards,rainbow6)": ["stripes", "suits"],
};
const key = (objectType: string, args: Record<string, unknown>) => `${objectType}(${Object.values(args).join(",")})`;
const domain: SettingsDomain = {
  offered: t => ({ Int: [INT_WIDE, INT_SMALL], string: [{ maxLength: 128 }], Grid: [GRID4, GRID5, GRID7] } as Record<string, object[]>)[t] as never ?? [],
  families: (t, args) => FAMILIES[key(t, args)] ?? [],
};

/** A Python Int room with some fields away from their defaults, so "nothing else moves" is visible. */
const start: GameSettings = {
  ...DEFAULT_SETTINGS, typeArgs: INT_WIDE, excludedFamilies: ["digits"], utilitySelectorId: "divine-lottery",
  planningSeconds: 30, startingObjectCount: 12, agentEnergyPerSecond: 3, defenceRate: 0, penaltyWeight: 2, commitClause: true,
};

test("a language change sets the grammar and the summon price to the new language's only choices, and nothing else", () => {
  const ts = applySettingsChange(start, { language: "typescript" }, domain);
  assert.deepEqual(ts, { ...start, language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" });
  const back = applySettingsChange(ts, { language: "python" }, domain);
  assert.deepEqual(back, start, "and back again");
});

test("an object type change takes that type's default instantiation and drops the excluded families it lacks; tuned fields stay", () => {
  const grid = applySettingsChange({ ...start, excludedFamilies: ["digits", "parity"] }, { objectType: "Grid" }, domain);
  assert.deepEqual(grid, { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: [] },
    "no retuning: 12 objects, 3 bits/s and the selector are the owner's, not Grid's tuned values");
  // A type whose default instantiation is not offered takes the first offered one.
  const noDefault: SettingsDomain = { ...domain, offered: t => (t === "Grid" ? [GRID5, GRID7] : domain.offered(t)) };
  assert.deepEqual(applySettingsChange(start, { objectType: "Grid" }, noDefault).typeArgs, GRID5);
  assert.throws(() => applySettingsChange(start, { objectType: "Grid" }, { ...domain, offered: () => [] }), /No Grid instantiation is offered/);
  assert.throws(() => applySettingsChange(start, { objectType: "Unicorn" }, domain), /Unknown object type/);
  // Back to Int: its default instantiation, and nothing remembered from the Grid detour.
  assert.deepEqual(applySettingsChange(grid, { objectType: "Int" }, domain), { ...start, excludedFamilies: [] });
});

test("type arguments are accepted only for an offered instantiation; excluded families the new one lacks are dropped", () => {
  const grid4: GameSettings = { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: ["corners", "frames"] };
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: GRID5 }, domain), { ...grid4, typeArgs: GRID5, excludedFamilies: ["corners"] });
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: GRID7 }, domain), { ...grid4, typeArgs: GRID7, excludedFamilies: [] });
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: { colours: "rgby", symbols: "base10", size: 5 } }, domain).typeArgs,
    { colours: "rgby", symbols: "base10", size: 5 }, "argument order does not matter");
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, domain),
    (e: unknown) => e instanceof SettingsChangeError && e.field === "typeArgs" && /Grid\(6,base16,rainbow6\) is not offered/.test(e.message));
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 5, symbols: "base10", colours: "plaid" } }, domain), /typeArgs/);
  assert.throws(() => applySettingsChange(start, { typeArgs: { min: 0, max: 9 } }, domain), /Int\(0,9\) is not offered/);
});

test("the grammar, goal dealing and summon price must be among the choices of the current language and type", () => {
  assert.deepEqual(applySettingsChange(start, { utilitySelectorId: "fair-aligned" }, domain), { ...start, utilitySelectorId: "fair-aligned" });
  assert.throws(() => applySettingsChange(start, { utilitySelectorId: "nope" }, domain), /utilitySelectorId/);
  assert.throws(() => applySettingsChange(start, { grammarId: "typescript-agent-v1" }, domain), /grammarId/);
  assert.throws(() => applySettingsChange(start, { complexityFunctionId: "ts-ast-bits-v1-uniform" }, domain), /complexityFunctionId/);
  // With the language in the same change, the TypeScript grammar is a valid explicit choice.
  assert.equal(applySettingsChange(start, { language: "typescript", grammarId: "typescript-agent-v1" }, domain).grammarId, "typescript-agent-v1");
  assert.throws(() => applySettingsChange(start, { language: "cobol" as never }, domain), /language/);
});

test("excluded families are any families of the instantiation", () => {
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: ["parity", "digits"] }, domain), { ...start, excludedFamilies: ["parity", "digits"] });
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: [] }, domain), { ...start, excludedFamilies: [] });
  assert.throws(() => applySettingsChange(start, { excludedFamilies: ["small"] }, domain), /small/, "small exists only on Int(0,9999)");
});

test("every numeric field, the commit clause and act targeting are free: only that field changes, bounds are validateSettings' job", () => {
  for (const [field, value] of [
    ["planningSeconds", 300], ["halfLifeSeconds", 1200], ["startingObjectCount", 0], ["spawnRateHz", 0.75], ["interactionRateHz", 7],
    ["interactionComputeMs", 5], ["stepBudget", 100_000], ["perActFloorBits", 0], ["pauseSeconds", 60], ["startingEnergy", 400],
    ["energyPerSecond", 4], ["agentEnergyPerSecond", 64], ["agentBatteryActs", 8], ["maxAgentsPerGod", 5], ["defenceRate", 0.25],
    ["penaltyWeight", 0.5], ["commitClause", false], ["objectSelection", "shelter"], ["startingEnergy", -1],
  ] as [keyof GameSettings, unknown][]) {
    assert.deepEqual(applySettingsChange(start, { [field]: value }, domain), { ...start, [field]: value }, `${field} = ${String(value)}`);
  }
  // Defence goals switched off leave the penalty weight alone (it is hidden, not reset).
  const on = applySettingsChange(start, { defenceRate: 0.5, penaltyWeight: 3 }, domain);
  assert.equal(applySettingsChange(on, { defenceRate: 0 }, domain).penaltyWeight, 3);
});

test("a whole settings object is a change of the fields that differ: re-applying a result reproduces it", () => {
  assert.deepEqual(applySettingsChange(start, { ...start }, domain), start, "no differences, no change");
  const edited = applySettingsChange(applySettingsChange(applySettingsChange(start, { objectType: "Grid" }, domain),
    { typeArgs: GRID5, language: "typescript" }, domain), { excludedFamilies: ["ladders"], startingObjectCount: 80 }, domain);
  assert.deepEqual(edited, { ...start, objectType: "Grid", typeArgs: GRID5, language: "typescript", grammarId: "typescript-agent-v1",
    complexityFunctionId: "ts-ast-bits-v1-uniform", excludedFamilies: ["ladders"], startingObjectCount: 80 });
  assert.deepEqual(applySettingsChange(start, edited, domain), edited, "the page's draft, sent whole, lands the same on the server");
  assert.throws(() => applySettingsChange(start, { colour: "red" } as never, domain), /Unknown setting colour/);
  assert.ok(sameSettings(edited, Object.fromEntries(Object.entries(edited).reverse()) as GameSettings), "key order is not a difference");
  assert.ok(!sameSettings(edited, { ...edited, startingObjectCount: 81 }));
});
