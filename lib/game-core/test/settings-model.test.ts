/**
 * The settings model (src/settings-model.ts): a change moves exactly the fields the game makes depend on it and
 * nothing else. Every expectation is written out by hand against a small hand-made domain (which instantiations are
 * playable, which families exist where), so no calibration table or tuned default leaks into these tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, type GameSettings } from "../src/settings.ts";
import { SETTINGS_FIELDS, SettingsChangeError, applySettingsChange, canonicalCostModel, sameSettings, type SettingsDomain } from "../src/settings-model.ts";

const GRID4 = { size: 4, symbols: "base10", colours: "rgb" };
const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };

const FAMILIES: Record<string, string[]> = {
  "Grid(4,base10,rgb)": ["stripes", "corners", "frames"],
  "Grid(5,base10,rgby)": ["stripes", "corners", "ladders"],
  "Grid(7,cards,rainbow6)": ["stripes", "suits"],
};
/** Defence (penalty) families per instantiation: the excluded-defence list is checked against these, rewards against FAMILIES. */
const DEFENCE: Record<string, string[]> = {
  "Grid(4,base10,rgb)": ["hate_red", "hate_rows"],
  "Grid(5,base10,rgby)": ["hate_red", "hate_rows", "hate_yellow"],
  "Grid(7,cards,rainbow6)": ["hate_red"],
};
const key = (objectType: string, args: Record<string, unknown>) => `${objectType}(${Object.values(args).join(",")})`;
const domain: SettingsDomain = {
  playable: t => (t === "Grid" ? [GRID4, GRID5, GRID7] : []) as never,
  families: (t, args, role) => (role === "defence" ? DEFENCE : FAMILIES)[key(t, args)] ?? [],
  typeFamilies: (t, role) => [...new Set(Object.entries(role === "defence" ? DEFENCE : FAMILIES).filter(([k]) => k.startsWith(`${t}(`)).flatMap(([, ids]) => ids))],
};

/** A Python room on the 4×4 board with some fields away from their defaults, so "nothing else moves" is visible. */
const start: GameSettings = {
  ...DEFAULT_SETTINGS, objectType: "Grid", typeArgs: GRID4, excludedFamilies: ["corners"], utilitySelectorId: "divine-lottery",
  planningSeconds: 30, startingObjectCount: 12, powerPerSecond: 3, defenceGoals: false, penaltyWeight: 2, commitClause: true,
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
  // A room stored with an object type that no longer exists (Int, string) moves to Grid's default instantiation.
  const removed = { ...start, objectType: "Int", typeArgs: { min: 0, max: 9 }, excludedFamilies: ["digits"] };
  assert.deepEqual(applySettingsChange(removed, { objectType: "Grid" }, domain), { ...start, excludedFamilies: [] },
    "no retuning: 12 objects, 3 bits/s and the selector are the owner's, not Grid's tuned values");
  // A type whose default instantiation is not listed takes the first listed one.
  const noDefault: SettingsDomain = { ...domain, playable: t => (t === "Grid" ? [GRID5, GRID7] : domain.playable(t)) };
  assert.deepEqual(applySettingsChange(removed, { objectType: "Grid" }, noDefault).typeArgs, GRID5);
  assert.throws(() => applySettingsChange(removed, { objectType: "Grid" }, { ...domain, playable: () => [] }), /No Grid instantiation is playable/);
  assert.throws(() => applySettingsChange(start, { objectType: "Unicorn" }, domain), /Unknown object type/);
  assert.throws(() => applySettingsChange(start, { objectType: "Int" }, domain), /Unknown object type/, "the integer type is gone");
  const grid5 = { ...start, typeArgs: GRID5 };
  assert.deepEqual(applySettingsChange(grid5, { objectType: "Grid" }, domain), grid5, "the same type is no change: the board stays");
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
});

test("a domain that accepts unlisted shapes (tables are prepared on demand) takes any valid arguments it approves, as the type resolves them", () => {
  const open: SettingsDomain = { ...domain, isPlayable: (t, args) => t !== "Grid" || (args as { size?: number }).size !== 3 };
  const grid4: GameSettings = { ...start, objectType: "Grid", typeArgs: GRID4, excludedFamilies: [] };
  assert.deepEqual(applySettingsChange(grid4, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, open).typeArgs, { size: 6, symbols: "base16", colours: "rainbow6" });
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 3, symbols: "base10", colours: "rgb" } }, open), /is not playable/, "the domain still refuses");
  assert.throws(() => applySettingsChange(grid4, { typeArgs: { size: 5, symbols: "base10", colours: "plaid" } }, open), /typeArgs/, "and the type refuses invalid arguments");
});

test("goal dealing must be among the choices of the current type", () => {
  assert.deepEqual(applySettingsChange(start, { utilitySelectorId: "fair-aligned" }, domain), { ...start, utilitySelectorId: "fair-aligned" });
  assert.throws(() => applySettingsChange(start, { utilitySelectorId: "nope" }, domain), /utilitySelectorId/);
});

test("excluded families are families of the object type; the list keeps only those the instantiation can deal", () => {
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: ["stripes", "corners"] }, domain), { ...start, excludedFamilies: ["stripes", "corners"] });
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: [] }, domain), { ...start, excludedFamilies: [] });
  assert.deepEqual(applySettingsChange(start, { excludedFamilies: ["stripes", "ladders"] }, domain), { ...start, excludedFamilies: ["stripes"] },
    "ladders is a Grid family this board cannot deal: excluding it means nothing");
  assert.throws(() => applySettingsChange(start, { excludedFamilies: ["vowels"] }, domain), /Not reward families of Grid: vowels/, "no family of the type");
  // A list saved before this rule (an entry the board cannot deal) can still be edited; the meaningless entry goes.
  const legacy = { ...start, excludedFamilies: ["corners", "ladders"] };
  assert.deepEqual(applySettingsChange(legacy, { excludedFamilies: ["corners", "ladders", "frames"] }, domain), { ...start, excludedFamilies: ["corners", "frames"] });
});

test("excluded defence families are the type's defence families, kept only where the instantiation has them; rewards and defences never mix", () => {
  const grid5: GameSettings = { ...start, typeArgs: GRID5, excludedFamilies: [], defenceGoals: true };
  assert.deepEqual(applySettingsChange(grid5, { excludedDefenceFamilies: ["hate_yellow", "hate_rows"] }, domain),
    { ...grid5, excludedDefenceFamilies: ["hate_yellow", "hate_rows"] });
  assert.throws(() => applySettingsChange(grid5, { excludedDefenceFamilies: ["stripes"] }, domain),
    (e: unknown) => e instanceof SettingsChangeError && e.field === "excludedDefenceFamilies" && /Not defence families of Grid: stripes/.test(e.message));
  assert.throws(() => applySettingsChange(grid5, { excludedFamilies: ["hate_red"] }, domain), /Not reward families of Grid: hate_red/);
  // A board without one of them drops it, exactly as for reward families; the switch is untouched.
  const excluded = applySettingsChange(grid5, { excludedDefenceFamilies: ["hate_yellow", "hate_rows"] }, domain);
  assert.deepEqual(applySettingsChange(excluded, { typeArgs: GRID7 }, domain), { ...grid5, typeArgs: GRID7, excludedDefenceFamilies: [] });
  assert.deepEqual(applySettingsChange(excluded, { typeArgs: GRID4 }, domain), { ...grid5, typeArgs: GRID4, excludedDefenceFamilies: ["hate_rows"] });
});

test("the room's settings sent back with one field edited: the stale dependent fields follow the edit", () => {
  // An assistant edits get_room_state's settings and sends them whole: the old grammar and arguments are no change.
  assert.deepEqual(applySettingsChange(start, { ...start, languages: ["typescript"] }, domain), { ...start, languages: ["typescript"] });
  assert.deepEqual(applySettingsChange(start, { ...start, typeArgs: GRID7 }, domain), { ...start, typeArgs: GRID7, excludedFamilies: [] });
});

test("every numeric field, the commit clause and act targeting are free: only that field changes, bounds are validateSettings' job", () => {
  for (const [field, value] of [
    ["planningSeconds", 300], ["halfLifeSeconds", 1200], ["startingObjectCount", 0], ["spawnRateHz", 0.75], ["interactionRateHz", 7],
    ["interactionComputeMs", 5], ["stepBudget", 100_000], ["pauseSeconds", 60], ["startingEnergy", 400],
    ["powerPerSecond", 64], ["maxAgentsPerGod", 5], ["defenceGoals", true],
    ["penaltyWeight", 0.5], ["commitClause", false], ["objectSelection", "shelter"], ["startingEnergy", -1], ["priorId", "uniform"],
    ["bidSeconds", 30], ["bidPricing", "second"],
  ] as [keyof GameSettings, unknown][]) {
    assert.deepEqual(applySettingsChange(start, { [field]: value }, domain), { ...start, [field]: value }, `${field} = ${String(value)}`);
  }
  // Defence goals switched off leave the penalty weight alone (it is hidden, not reset).
  const on = applySettingsChange(start, { defenceGoals: true, penaltyWeight: 3 }, domain);
  assert.equal(applySettingsChange(on, { defenceGoals: false }, domain).penaltyWeight, 3);
});

test("a whole settings object is a change of the fields that differ: re-applying a result reproduces it", () => {
  assert.deepEqual(applySettingsChange(start, { ...start }, domain), start, "no differences, no change");
  const edited = applySettingsChange(applySettingsChange(start,
    { typeArgs: GRID5, languages: ["typescript", "python"] }, domain), { excludedFamilies: ["ladders"], startingObjectCount: 80 }, domain);
  assert.deepEqual(edited, { ...start, typeArgs: GRID5, languages: ["typescript", "python"],
    excludedFamilies: ["ladders"], startingObjectCount: 80 });
  assert.deepEqual(applySettingsChange(start, edited, domain), edited, "the page's draft, sent whole, lands the same on the server");
  assert.throws(() => applySettingsChange(start, { colour: "red" } as never, domain), /Unknown setting colour/);
  // A deleted feature's setting (tiered rules, D1) is ignored in a change, not refused: an old draft may still send it.
  assert.deepEqual(applySettingsChange(start, { ruleTiers: { depth: 1 } } as never, domain), start);
  assert.ok(sameSettings(edited, Object.fromEntries(Object.entries(edited).reverse()) as GameSettings), "key order is not a difference");
  assert.ok(!sameSettings(edited, { ...edited, startingObjectCount: 81 }));
});

test("the cost model: one of the instantiation's models, the default never stored, dropped when the world stops supporting it", () => {
  assert.deepEqual([...SETTINGS_FIELDS].sort(), [...Object.keys(DEFAULT_SETTINGS), "costModel"].sort());
  const grid = start;
  assert.ok(!("costModel" in grid));
  const distance = applySettingsChange(grid, { costModel: "distance-v1" }, domain);
  assert.deepEqual(distance, { ...grid, costModel: "distance-v1" }, "nothing else moves");
  assert.deepEqual(applySettingsChange(distance, { costModel: "set-v1" }, domain), grid, "the default is the field's absence: and back again");
  assert.deepEqual(applySettingsChange(grid, { costModel: "set-v1" }, domain), grid, "choosing the default where it already holds is no change");
  assert.deepEqual(applySettingsChange(distance, { planningSeconds: 99 }, domain), { ...distance, planningSeconds: 99 }, "another field leaves it alone");
  // The 7×7 cards in six colours do not offer it (a full look would cost more than its cheapest change: settings.ts
  // lookIsCheaperThanChange), so the model goes when the board changes to that one.
  const cards = applySettingsChange(distance, { typeArgs: GRID7 }, domain);
  assert.deepEqual(cards, { ...grid, typeArgs: GRID7, excludedFamilies: [] }, "dropped where the board does not offer it");
  assert.deepEqual(applySettingsChange(distance, { ...distance, typeArgs: GRID7 }, domain), cards, "the whole settings sent back with the board edited");
  for (const [base, bad, message] of [[cards, "distance-v1", /Unsupported costModel for Grid\(7,cards,rainbow6\)/], [grid, "free", /costModel must be one of set-v1, distance-v1/], [grid, 7, /costModel must be one of/]] as const) {
    assert.throws(() => applySettingsChange(base, { costModel: bad as never }, domain),
      (e: unknown) => e instanceof SettingsChangeError && e.field === "costModel" && message.test(e.message), String(bad));
  }
  assert.deepEqual(applySettingsChange(start, { costModel: "set-v1" }, domain), start);
  // The same spelling for complete settings from anywhere (a saved setup).
  assert.deepEqual(canonicalCostModel({ ...grid, costModel: "set-v1" }), grid);
  assert.equal(canonicalCostModel(distance), distance);
  assert.equal(canonicalCostModel(grid), grid);
  const refused = { ...start, costModel: "distance-v1" as const };
  assert.equal(canonicalCostModel(refused), refused, "only the default's spelling is touched: validateSettings refuses the rest");
});
