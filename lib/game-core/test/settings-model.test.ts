/**
 * The settings model (src/settings-model.ts): a change moves exactly the fields the game makes depend on it and
 * nothing else. Every expectation is written out by hand against a small hand-made domain (which instantiations are
 * playable, which families exist where), so no calibration table or tuned default leaks into these tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, type GameSettings } from "../src/settings.ts";
import { SettingsChangeError, applySettingsChange, sameSettings, type SettingsDomain } from "../src/settings-model.ts";

const INT_WIDE = { min: -2147483648, max: 2147483647 };
const INT_SMALL = { min: 0, max: 9999 };
const GRID4 = { size: 4, symbols: "base10", colours: "ryb" };
const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };

const FAMILIES: Record<string, string[]> = {
  "Int(-2147483648,2147483647)": ["parity", "digits"],
  "Int(0,9999)": ["parity", "digits", "small"],
  "string(128)": ["vowels"],
  "Grid(4,base10,ryb)": ["stripes", "corners", "frames"],
  "Grid(5,base10,rgby)": ["stripes", "corners", "ladders"],
  "Grid(7,cards,rainbow6)": ["stripes", "suits"],
};
/** Defence (penalty) families per instantiation: the excluded-defence list is checked against these, rewards against FAMILIES. */
const DEFENCE: Record<string, string[]> = {
  "Grid(4,base10,ryb)": ["hate_red", "hate_rows"],
  "Grid(5,base10,rgby)": ["hate_red", "hate_rows", "hate_yellow"],
  "Grid(7,cards,rainbow6)": ["hate_red"],
};
const key = (objectType: string, args: Record<string, unknown>) => `${objectType}(${Object.values(args).join(",")})`;
const domain: SettingsDomain = {
  playable: t => ({ Int: [INT_WIDE, INT_SMALL], string: [{ maxLength: 128 }], Grid: [GRID4, GRID5, GRID7] } as Record<string, object[]>)[t] as never ?? [],
  families: (t, args, role) => (role === "defence" ? DEFENCE : FAMILIES)[key(t, args)] ?? [],
  typeFamilies: (t, role) => [...new Set(Object.entries(role === "defence" ? DEFENCE : FAMILIES).filter(([k]) => k.startsWith(`${t}(`)).flatMap(([, ids]) => ids))],
};

/** A Python Int room with some fields away from their defaults, so "nothing else moves" is visible. */
const start: GameSettings = {
  ...DEFAULT_SETTINGS, typeArgs: INT_WIDE, excludedFamilies: ["digits"], utilitySelectorId: "divine-lottery",
  planningSeconds: 30, startingObjectCount: 12, agentEnergyPerSecond: 3, defenceGoals: false, penaltyWeight: 2, commitClause: true,
};

test("a change of allowed languages moves nothing else", () => {
  const both = applySettingsChange(start, { languages: ["typescript", "python"] }, domain);
  assert.deepEqual(both, { ...start, languages: ["typescript", "python"] });
  assert.deepEqual(applySettingsChange(both, { languages: ["python"] }, domain), start, "and back again");
  assert.deepEqual(applySettingsChange(start, { languages: ["python", "python", "typescript"] }, domain).languages, ["python", "typescript"],
    "a language listed twice is listed once");
});

test("the allowed languages are a non-empty list of supported languages", () => {
  for (const bad of [[], ["cobol"], "python", null]) {
    assert.throws(() => applySettingsChange(start, { languages: bad as never }, domain),
      (e: unknown) => e instanceof SettingsChangeError && e.field === "languages", JSON.stringify(bad));
  }
});

test("a legacy single-language change still works: it allows exactly that language", () => {
  assert.deepEqual(applySettingsChange(start, { language: "typescript" } as never, domain), { ...start, languages: ["typescript"] });
  assert.deepEqual(applySettingsChange(start, { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform" } as never, domain),
    { ...start, languages: ["typescript"] }, "the derived ids it used to carry are ignored");
  assert.throws(() => applySettingsChange(start, { language: "cobol" } as never, domain), /languages/);
  assert.throws(() => applySettingsChange(start, { grammarId: "python-agent-v1" } as never, domain), /Unknown setting grammarId/,
    "the derived ids are not settings of their own");
});

test("an object type change takes that type's default instantiation and drops the excluded families it lacks; tuned fields stay", () => {
  const grid = applySettingsChange({ ...start, excludedFamilies: ["digits", "parity"] }, { objectType: "Grid" }, domain);
  assert.deepEqual(grid, { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: [] },
    "no retuning: 12 objects, 3 bits/s and the selector are the owner's, not Grid's tuned values");
  // A type whose default instantiation is not listed takes the first listed one.
  const noDefault: SettingsDomain = { ...domain, playable: t => (t === "Grid" ? [GRID5, GRID7] : domain.playable(t)) };
  assert.deepEqual(applySettingsChange(start, { objectType: "Grid" }, noDefault).typeArgs, GRID5);
  assert.throws(() => applySettingsChange(start, { objectType: "Grid" }, { ...domain, playable: () => [] }), /No Grid instantiation is playable/);
  assert.throws(() => applySettingsChange(start, { objectType: "Unicorn" }, domain), /Unknown object type/);
  // Back to Int: its default instantiation, and nothing remembered from the Grid detour.
  assert.deepEqual(applySettingsChange(grid, { objectType: "Int" }, domain), { ...start, excludedFamilies: [] });
});

test("type arguments are accepted only for a playable instantiation; excluded families the new one lacks are dropped", () => {
  const grid4: GameSettings = { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: ["corners", "frames"] };
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: GRID5 }, domain), { ...grid4, typeArgs: GRID5, excludedFamilies: ["corners"] });
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: GRID7 }, domain), { ...grid4, typeArgs: GRID7, excludedFamilies: [] });
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: { colours: "rgby", symbols: "base10", size: 5 } }, domain).typeArgs,
    { colours: "rgby", symbols: "base10", size: 5 }, "argument order does not matter");
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, domain),
    (e: unknown) => e instanceof SettingsChangeError && e.field === "typeArgs" && /Grid\(6,base16,rainbow6\) is not playable/.test(e.message));
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 5, symbols: "base10", colours: "plaid" } }, domain), /typeArgs/);
  assert.throws(() => applySettingsChange(start, { typeArgs: { min: 0, max: 9 } }, domain), /Int\(0,9\) is not playable/);
});

test("a domain that accepts unlisted shapes (tables are prepared on demand) takes any valid arguments it approves, as the type resolves them", () => {
  const open: SettingsDomain = { ...domain, isPlayable: (t, args) => t !== "Grid" || (args as { size?: number }).size !== 3 };
  assert.deepEqual(applySettingsChange(start, { typeArgs: { max: 9, min: 0 } }, open).typeArgs, { min: 0, max: 9 }, "an unlisted Int range");
  const grid4: GameSettings = { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: [] };
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, open).typeArgs, { size: 6, symbols: "base16", colours: "rainbow6" });
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 3, symbols: "base10", colours: "rgb" } }, open), /is not playable/, "the domain still refuses");
  assert.throws(() => applySettingsChange(start, { typeArgs: { min: 9, max: 0 } }, open), /typeArgs/, "and the type refuses invalid arguments");
});

test("goal dealing must be among the choices of the current type", () => {
  assert.deepEqual(applySettingsChange(start, { utilitySelectorId: "fair-aligned" }, domain), { ...start, utilitySelectorId: "fair-aligned" });
  assert.throws(() => applySettingsChange(start, { utilitySelectorId: "nope" }, domain), /utilitySelectorId/);
});

test("excluded families are families of the object type; the list keeps only those the instantiation can deal", () => {
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: ["parity", "digits"] }, domain), { ...start, excludedFamilies: ["parity", "digits"] });
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: [] }, domain), { ...start, excludedFamilies: [] });
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: ["parity", "small"] }, domain), { ...start, excludedFamilies: ["parity"] },
    "small is an Int family this board cannot deal: excluding it means nothing");
  assert.throws(() => applySettingsChange(start, { excludedFamilies: ["vowels"] }, domain), /Not reward families of Int: vowels/, "a string family");
  // A list saved before this rule (an entry the board cannot deal) can still be edited; the meaningless entry goes.
  const legacy = { ...start, excludedFamilies: ["digits", "small"] };
  assert.deepEqual(applySettingsChange(legacy, { excludedFamilies: ["digits", "small", "parity"] }, domain), { ...start, excludedFamilies: ["digits", "parity"] });
});

test("excluded defence families are the type's defence families, kept only where the instantiation has them; rewards and defences never mix", () => {
  const grid5: GameSettings = { ...start, objectType: "Grid", typeArgs: GRID5, excludedFamilies: [], defenceGoals: true };
  assert.deepEqual(applySettingsChange(grid5, { excludedDefenceFamilies: ["hate_yellow", "hate_rows"] }, domain),
    { ...grid5, excludedDefenceFamilies: ["hate_yellow", "hate_rows"] });
  assert.throws(() => applySettingsChange(grid5, { excludedDefenceFamilies: ["stripes"] }, domain),
    (e: unknown) => e instanceof SettingsChangeError && e.field === "excludedDefenceFamilies" && /Not defence families of Grid: stripes/.test(e.message));
  assert.throws(() => applySettingsChange(grid5, { excludedFamilies: ["hate_red"] }, domain), /Not reward families of Grid: hate_red/);
  // A board without one of them drops it, exactly as for reward families; the switch is untouched.
  const excluded = applySettingsChange(grid5, { excludedDefenceFamilies: ["hate_yellow", "hate_rows"] }, domain);
  assert.deepEqual(applySettingsChange(excluded, { typeArgs: GRID7 }, domain), { ...grid5, typeArgs: GRID7, excludedDefenceFamilies: [] });
  assert.deepEqual(applySettingsChange(excluded, { typeArgs: GRID4 }, domain), { ...grid5, typeArgs: GRID4, excludedDefenceFamilies: ["hate_rows"] });
  assert.deepEqual(applySettingsChange(excluded, { objectType: "Int" }, domain),
    { ...grid5, objectType: "Int", typeArgs: INT_WIDE, excludedDefenceFamilies: [] });
});

test("the room's settings sent back with one field edited: the stale dependent fields follow the edit", () => {
  // An assistant edits get_room_state's settings and sends them whole: the old grammar and arguments are no change.
  assert.deepEqual(applySettingsChange(start, { ...start, languages: ["typescript"] }, domain), { ...start, languages: ["typescript"] });
  assert.deepEqual(applySettingsChange(start, { ...start, objectType: "Grid" }, domain), { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: [] });
});

test("every numeric field, the commit clause and act targeting are free: only that field changes, bounds are validateSettings' job", () => {
  for (const [field, value] of [
    ["planningSeconds", 300], ["halfLifeSeconds", 1200], ["startingObjectCount", 0], ["spawnRateHz", 0.75], ["interactionRateHz", 7],
    ["interactionComputeMs", 5], ["stepBudget", 100_000], ["perActFloorBits", 0], ["pauseSeconds", 60], ["startingEnergy", 400],
    ["energyPerSecond", 4], ["agentEnergyPerSecond", 64], ["agentBatteryActs", 8], ["maxAgentsPerGod", 5], ["defenceGoals", true],
    ["penaltyWeight", 0.5], ["commitClause", false], ["objectSelection", "shelter"], ["startingEnergy", -1], ["priorId", "uniform"],
  ] as [keyof GameSettings, unknown][]) {
    assert.deepEqual(applySettingsChange(start, { [field]: value }, domain), { ...start, [field]: value }, `${field} = ${String(value)}`);
  }
  // Defence goals switched off leave the penalty weight alone (it is hidden, not reset).
  const on = applySettingsChange(start, { defenceGoals: true, penaltyWeight: 3 }, domain);
  assert.equal(applySettingsChange(on, { defenceGoals: false }, domain).penaltyWeight, 3);
});

test("a whole settings object is a change of the fields that differ: re-applying a result reproduces it", () => {
  assert.deepEqual(applySettingsChange(start, { ...start }, domain), start, "no differences, no change");
  const edited = applySettingsChange(applySettingsChange(applySettingsChange(start, { objectType: "Grid" }, domain),
    { typeArgs: GRID5, languages: ["typescript", "python"] }, domain), { excludedFamilies: ["ladders"], startingObjectCount: 80 }, domain);
  assert.deepEqual(edited, { ...start, objectType: "Grid", typeArgs: GRID5, languages: ["typescript", "python"],
    excludedFamilies: ["ladders"], startingObjectCount: 80 });
  assert.deepEqual(applySettingsChange(start, edited, domain), edited, "the page's draft, sent whole, lands the same on the server");
  assert.throws(() => applySettingsChange(start, { colour: "red" } as never, domain), /Unknown setting colour/);
  assert.ok(sameSettings(edited, Object.fromEntries(Object.entries(edited).reverse()) as GameSettings), "key order is not a difference");
  assert.ok(!sameSettings(edited, { ...edited, startingObjectCount: 81 }));
});
