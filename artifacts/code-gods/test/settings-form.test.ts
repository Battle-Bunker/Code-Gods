/**
 * The configuration page's rules (onboarding-and-config.md §4.2, §4.4): limits as the engine enforces them, the
 * settings model's domain built from the manifest, the per-argument shape controls, the setup combobox's search and
 * ownership words, stepped choices and the summary lines.
 * The dependencies themselves are game-core's (settings-model.test.ts); here only what the page adds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, applySettingsChange, seedSetupSettings } from "@workspace/game-core";
import { objectType } from "@workspace/game-types";
import {
  SECTIONS, argChoices, choiceLabel, formatValue, toggleLanguage, dealerNote, formatSeconds, defenceBlocker, draftErrors, fieldError, fieldsOf, firstUseNote, isHidden, lengthLine, paceWord,
  settingsDomain, shelfEntries, stepChoices,
} from "../src/lib/settings-form.ts";
import { editBlocker, freeName, ownerLabel, searchSetups } from "../src/lib/setup-words.ts";

const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };
/** A manifest's object types as the engine sends them, hand-cut to three listed instantiations. */
const types = [
  { id: "Int", defaults: { min: -2147483648, max: 2147483647 }, playable: [{ key: "Int(0,9999)", args: { min: 0, max: 9999 } }] },
  { id: "Grid", defaults: { size: 4, symbols: "base10", colours: "ryb" }, playable: [{ key: "Grid(5,base10,rgby)", args: GRID5 }, { key: "Grid(7,cards,rainbow6)", args: GRID7 }] },
];

test("the sections run World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with no Start from", () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ["world", "goals", "agents", "energy", "population", "time", "players", "review"]);
  assert.deepEqual(fieldsOf("goals"), ["utilitySelectorId", "defenceGoals", "excludedDefenceFamilies", "excludedFamilies", "penaltyWeight", "priorId"], "asked, then more");
  assert.deepEqual(fieldsOf("world"), ["objectType", "typeArgs", "languages"], "the grammar and summon price follow each agent's language");
  assert.deepEqual(fieldsOf("population"), ["startingObjectCount", "spawnRateHz", "spawnFunctionId", "objectSelection"]);
});

test("limits mirror validateSettings and the engine's resource limits, with the message on the field", () => {
  assert.equal(fieldError("maxAgentsPerGod", 0), "Must be between 1 and 200 agents.");
  assert.equal(fieldError("maxAgentsPerGod", 2.5), "Must be a whole number.");
  assert.equal(fieldError("maxAgentsPerGod", 200), null);
  assert.equal(fieldError("startingObjectCount", 1001), "Must be between 0 and 1,000 objects.", "nextSettings caps objects at 1000");
  assert.equal(fieldError("spawnRateHz", 10.5), "Must be between 0 and 10 per second.");
  assert.equal(fieldError("halfLifeSeconds", 0), "Must be more than 0 seconds.");
  assert.equal(fieldError("pauseSeconds", 3601), "Must be between 0 and 3,600 seconds.");
  assert.equal(fieldError("agentBatteryActs", 0.5), "Must be at least 1 acts.");
  assert.equal(fieldError("planningSeconds", NaN), "Enter a number.");
  const grid = seedSetupSettings("grid-classic");
  assert.deepEqual(draftErrors(grid), {});
  assert.deepEqual(Object.keys(draftErrors({ ...grid, stepBudget: 0 })), ["stepBudget"]);
  assert.equal(draftErrors({ ...grid, startingEnergy: null as unknown as number }).startingEnergy, "Enter a number.", "an emptied field (NaN, stored as null) is an error, not 0");
  assert.match(draftErrors({ ...grid, utilitySelectorId: "nope" })._form ?? "", /utilitySelectorId/);
  // Defence goals on with every one excluded: refused on the page as on the server (the page's domain knows the families).
  const domain = settingsDomain([{ id: "Grid", playable: [{ args: grid.typeArgs }] }]);
  const every = domain.families("Grid", grid.typeArgs, "defence");
  assert.ok(every.length > 0);
  assert.match(draftErrors({ ...grid, defenceGoals: true, excludedDefenceFamilies: every }, domain)._form ?? "", /at least one defence goal/);
  assert.deepEqual(draftErrors({ ...grid, defenceGoals: true, excludedDefenceFamilies: every.slice(1) }, domain), {});
});

test("the domain lists the manifest's playable instantiations, accepts any other valid unretired one, and the families of each", () => {
  const domain = settingsDomain(types);
  assert.deepEqual(domain.playable("Grid"), [GRID5, GRID7]);
  assert.deepEqual(domain.playable("string"), [], "a type the manifest does not list lists nothing");
  assert.equal(domain.isPlayable!("Grid", { size: 6, symbols: "base16", colours: "rainbow6" }), true, "no table needed");
  assert.equal(domain.isPlayable!("Grid", { size: 3, symbols: "base10", colours: "rgb" }), false, "3×3 is retired");
  assert.ok(domain.families("Grid", GRID5, "reward").includes("ladder_of_numbers"));
  assert.ok(!domain.families("Grid", GRID7, "reward").includes("ladder_of_numbers"), "a locked family does not exist on that board");
  assert.ok(domain.families("Grid", GRID5, "defence").every(id => id.startsWith("hate_")) && domain.families("Grid", GRID5, "defence").length > 0);
  assert.ok(!domain.families("Grid", GRID5, "reward").some(id => id.startsWith("hate_")), "rewards and defence goals are separate lists");
  // The page's controls run through the model with this domain: a new world takes its first listed instantiation.
  const classic = seedSetupSettings("grid-classic");
  const toInt = applySettingsChange(classic, { objectType: "Int" }, domain);
  assert.deepEqual([toInt.typeArgs, toInt.excludedFamilies, toInt.startingObjectCount], [{ min: 0, max: 9999 }, [], classic.startingObjectCount]);
  assert.deepEqual(applySettingsChange(classic, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, domain).typeArgs, { size: 6, symbols: "base16", colours: "rainbow6" });
  assert.throws(() => applySettingsChange(classic, { typeArgs: { size: 3, symbols: "base10", colours: "rgb" } }, domain), /not playable/);
  // The shelf shows only the families that exist on the board, marked as the draft deals them.
  const shelf = shelfEntries("Grid", GRID7, ["stripe_painter"]);
  assert.ok(shelf.length > 0 && shelf.every(e => e.available));
  assert.ok(!shelf.some(e => e.id === "ladder_of_numbers"));
  assert.deepEqual(shelf.filter(e => e.excluded).map(e => e.id), ["stripe_painter"]);
  const defence = shelfEntries("Grid", GRID7, ["hate_colour"], "defence");
  assert.ok(defence.length > 0 && defence.every(e => e.role === "penalty"));
  assert.deepEqual(defence.filter(e => e.excluded).map(e => e.id), ["hate_colour"]);
  assert.equal(defenceBlocker({ objectType: "Grid", typeArgs: GRID5 }), null);
  assert.equal(defenceBlocker({ objectType: "Int", typeArgs: { min: 0, max: 9999 } }), "This world has no defence goals to deal.");
});

/** The playable Grid shapes as the engine lists them (every size 4–7 × symbols × colours); some prepare tables first. */
const GRID = { id: "Grid", params: objectType("Grid").params, defaults: objectType("Grid").defaults,
  playable: [4, 5, 6, 7].flatMap(size => ["base10", "base12", "base16", "cards"].flatMap(symbols => ["ryb", "rgby", "rainbow6"].map(colours => ({
    args: { size, symbols, colours },
    prepare: size === 7 && symbols === "cards" ? { toCompute: 12, seconds: 260 } : null,
    synergy: size === 5 && symbols === "base10" && colours === "rgby" ? ["uniform"] : [],
  })))) };

test("the board shape is one control per argument; every playable combination is enabled, shipped tables or not", () => {
  const controls = argChoices(GRID, GRID5);
  assert.deepEqual(controls.map(c => c.param.id), ["size", "symbols", "colours"], "size, symbols and colours, from the type's params");
  const [size, symbols, colours] = controls;
  assert.deepEqual(size!.choices.map(c => c.value), [4, 5, 6, 7], "3×3 is retired: no playable board uses it");
  assert.ok([size, symbols, colours].every(c => c!.choices.every(x => x.enabled && !x.reason)), "nothing is disabled for want of tables");
  assert.deepEqual(symbols!.choices.map(c => c.value), ["base10", "base12", "base16", "cards"]);
  assert.deepEqual([size!.current, symbols!.current, colours!.current], [5, "base10", "rgby"]);
  assert.deepEqual(colours!.choices.map(c => [c.value, c.label]), [["ryb", "Red, yellow, blue"], ["rgby", "Red, yellow, green, blue"], ["rainbow6", "Rainbow (6 colours)"]],
    "red, yellow, blue is the three-colour set offered; red, green, blue is not");
  // A stored room on red, green, blue keeps it: listed (by its name) as the current value and still playable.
  const legacy = argChoices(GRID, { size: 4, symbols: "base10", colours: "rgb" })[2]!;
  assert.deepEqual(legacy.choices.map(c => [c.value, c.label, c.enabled]),
    [["ryb", "Red, yellow, blue", true], ["rgby", "Red, yellow, green, blue", true], ["rainbow6", "Rainbow (6 colours)", true], ["rgb", "Red, green, blue", true]]);
  // A retired combination (the current value kept on screen) is disabled with the reason.
  const retired = argChoices(GRID, { size: 3, symbols: "base10", colours: "rgb" })[1]!;
  assert.ok(retired.choices.every(c => !c.enabled && /retired/.test(c.reason!)));
  // Int: every combination of its presets, including ranges nobody shipped tables for.
  const int = { id: "Int", params: objectType("Int").params, defaults: objectType("Int").defaults,
    playable: [[-2147483648, 2147483647], [-2147483648, 9999], [0, 2147483647], [0, 9999]].map(([min, max]) => ({ args: { min, max } })) };
  const [min, max] = argChoices(int, { min: 0, max: 9999 });
  assert.deepEqual(min!.choices.map(c => [c.value, c.enabled]), [[-2147483648, true], [0, true]]);
  assert.deepEqual(max!.choices.map(c => [c.value, c.enabled]), [[2147483647, true], [9999, true]]);
});

test("a shape whose first game computes tables says so with the measured time; the dealer says when it deals like the Divine Lottery", () => {
  assert.equal(firstUseNote(GRID, GRID5), null, "every table shipped or analytic: nothing to say");
  // A stored room on a legacy shape (red, green, blue) reads the engine's legacy list: its tables are shipped.
  const RGB4 = { size: 4, symbols: "base10", colours: "rgb" };
  assert.equal(firstUseNote({ ...GRID, legacy: [{ args: RGB4, prepare: null }] }, RGB4), null);
  assert.match(firstUseNote({ ...GRID, legacy: [{ args: RGB4, prepare: { toCompute: 3, seconds: 35 } }] }, RGB4)!, /up to 3 rule tables/);
  assert.equal(firstUseNote(GRID, GRID7), "The first game on this shape on this server prepares up to 12 rule tables (about 4 min 20 s) before planning starts; later games start at once.");
  const int = { id: "Int", params: objectType("Int").params, defaults: objectType("Int").defaults, playable: [{ args: { min: 0, max: 9999 }, prepare: null }] };
  assert.match(firstUseNote(int, { min: 5, max: 100 })!, /prepares its rule tables \(about 35 s\)/, "an unlisted range: the type's measured estimate");
  assert.equal(dealerNote(GRID, { typeArgs: GRID5, utilitySelectorId: "fair-aligned", priorId: "uniform" }), null, "synergy measured");
  assert.match(dealerNote(GRID, { typeArgs: GRID5, utilitySelectorId: "fair-aligned", priorId: "other" })!, /deals like the Divine Lottery/, "but not under this prior");
  assert.match(dealerNote(GRID, { typeArgs: GRID7, utilitySelectorId: "fair-aligned", priorId: "uniform" })!, /deals like the Divine Lottery/);
  assert.equal(dealerNote(GRID, { typeArgs: GRID7, utilitySelectorId: "divine-lottery", priorId: "uniform" }), null);
  assert.deepEqual([35, 89.6, 119.6, 120, 260].map(formatSeconds), ["35 s", "1 min 30 s", "2 min", "2 min", "4 min 20 s"], "rounded once, never \"1 min 60 s\"");
});

test("the setup combobox: search by name, owner or summary; whose it is; why Edit is unavailable", () => {
  const setups = [
    { id: "1", name: "Classic", summary: "5×5 with four colours", ownerName: "System", system: true, mine: false, editable: false },
    { id: "2", name: "Classic's copy", summary: "5×5 with four colours", ownerName: "Ada Lovelace", system: false, mine: true, editable: true },
    { id: "3", name: "Big cards", summary: "Grid 7×7 · Playing cards", ownerName: "Bo Diddley", system: false, mine: false, editable: false },
  ];
  assert.deepEqual(searchSetups(setups, "").map(s => s.id), ["1", "2", "3"]);
  assert.deepEqual(searchSetups(setups, "classic").map(s => s.id), ["1", "2"], "by name");
  assert.deepEqual(searchSetups(setups, "bo").map(s => s.id), ["3"], "by owner");
  assert.deepEqual(searchSetups(setups, "system").map(s => s.id), ["1"]);
  assert.deepEqual(searchSetups(setups, "you").map(s => s.id), ["2"], "the viewer's own as \"You\"");
  assert.deepEqual(searchSetups(setups, "7×7 cards").map(s => s.id), ["3"], "every word, from the summary too");
  assert.deepEqual(setups.map(ownerLabel), ["System", "You", "Bo Diddley"]);
  assert.deepEqual(setups.map(editBlocker), ["System setups cannot be edited: duplicate it", null, "Only Bo Diddley can edit this setup"]);
  // A copy's name, as the engine makes it: "<name>'s copy", then " 2"…, shortened to 40 characters.
  assert.equal(freeName("Classic", "'s copy", []), "Classic's copy");
  assert.equal(freeName("Classic", "'s copy", ["classic's COPY", "Classic's copy 2"]), "Classic's copy 3");
  assert.equal(freeName("L".repeat(40), "'s copy", []), `${"L".repeat(33)}'s copy`);
});

test("the language multi-select: toggling keeps the order (the first is the default) and never empties the set; labels and errors", () => {
  assert.deepEqual(toggleLanguage(["python"], "typescript", true), ["python", "typescript"]);
  assert.deepEqual(toggleLanguage(["typescript"], "python", true), ["typescript", "python"], "the default stays first");
  assert.deepEqual(toggleLanguage(["typescript", "python"], "typescript", false), ["python"]);
  assert.deepEqual(toggleLanguage(["python", "typescript"], "python", false), ["typescript"]);
  assert.deepEqual(toggleLanguage(["python"], "python", false), ["python"], "at least one language stays allowed");
  assert.deepEqual(toggleLanguage(["python"], "python", true), ["python"]);
  assert.equal(formatValue("languages", ["python", "typescript"]), "Python, TypeScript");
  assert.match(draftErrors({ ...DEFAULT_SETTINGS, languages: [] }).languages ?? "", /at least one language/);
  assert.equal(draftErrors({ ...DEFAULT_SETTINGS, languages: ["typescript", "python"] }).languages, undefined);
});

test("penalty weight and the defence checklist hide while defence goals are off; stepped choices keep the current value; summary lines", () => {
  for (const key of ["penaltyWeight", "excludedDefenceFamilies"] as const) {
    assert.equal(isHidden(key, { ...DEFAULT_SETTINGS, defenceGoals: false }), true, key);
    assert.equal(isHidden(key, { ...DEFAULT_SETTINGS, defenceGoals: true }), false, key);
  }
  assert.deepEqual(stepChoices("pauseSeconds", 180), [60, 180, 300]);
  assert.deepEqual(stepChoices("pauseSeconds", 240), [60, 180, 240, 300]);
  assert.equal(lengthLine({ planningSeconds: 60, halfLifeSeconds: 300 }), "~6 min (often 3–13)");
  assert.deepEqual(stepChoices("interactionRateHz", 25).map(v => choiceLabel("interactionRateHz", v)), ["Slow (25/s)", "Normal (100/s)", "Fast (300/s)", "Max (1,000/s)"]);
  assert.deepEqual([30, 60, 90].map(v => choiceLabel("planningSeconds", v)), ["30 s", "1 min", "90 s"]);
  assert.deepEqual([true, false].map(v => choiceLabel("defenceGoals", v)), ["On: everyone", "Off"]);
  assert.equal(choiceLabel("commitClause", true), "Offered");
  assert.equal(paceWord(25), "slow");
  assert.equal(paceWord(100), "normal");
  assert.equal(paceWord(300), "fast");
});
