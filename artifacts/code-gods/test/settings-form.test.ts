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
  SECTIONS, argChoices, choiceLabel, defenceBlocker, draftErrors, fieldError, fieldsOf, isHidden, lengthLine, paceWord,
  settingsDomain, shelfEntries, stepChoices,
} from "../src/lib/settings-form.ts";
import { editBlocker, ownerLabel, searchSetups } from "../src/lib/setup-words.ts";

const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };
/** A manifest's object types as the engine sends them, hand-cut to three offered instantiations. */
const types = [
  { id: "Int", defaults: { min: -2147483648, max: 2147483647 }, offered: [{ key: "Int(0,9999)", args: { min: 0, max: 9999 } }] },
  { id: "Grid", defaults: { size: 4, symbols: "base10", colours: "rgb" }, offered: [{ key: "Grid(5,base10,rgby)", args: GRID5 }, { key: "Grid(7,cards,rainbow6)", args: GRID7 }] },
];

test("the sections run World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with no Start from", () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ["world", "goals", "agents", "energy", "population", "time", "players", "review"]);
  assert.deepEqual(fieldsOf("goals"), ["utilitySelectorId", "defenceGoals", "excludedDefenceFamilies", "excludedFamilies", "penaltyWeight", "priorId"], "asked, then more");
  assert.deepEqual(fieldsOf("world"), ["objectType", "typeArgs", "language", "grammarId", "complexityFunctionId"], "the grammar and summon price are controls too");
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
  const domain = settingsDomain([{ id: "Grid", offered: [{ args: grid.typeArgs }] }]);
  const every = domain.families("Grid", grid.typeArgs, "defence");
  assert.ok(every.length > 0);
  assert.match(draftErrors({ ...grid, defenceGoals: true, excludedDefenceFamilies: every }, domain)._form ?? "", /at least one defence goal/);
  assert.deepEqual(draftErrors({ ...grid, defenceGoals: true, excludedDefenceFamilies: every.slice(1) }, domain), {});
});

test("the domain offers exactly the manifest's instantiations, and the families of each from the shipped catalogue", () => {
  const domain = settingsDomain(types);
  assert.deepEqual(domain.offered("Grid"), [GRID5, GRID7]);
  assert.deepEqual(domain.offered("string"), [], "a type the manifest does not list offers nothing");
  assert.ok(domain.families("Grid", GRID5, "reward").includes("ladder_of_numbers"));
  assert.ok(!domain.families("Grid", GRID7, "reward").includes("ladder_of_numbers"), "a locked family does not exist on that board");
  assert.ok(domain.families("Grid", GRID5, "defence").every(id => id.startsWith("hate_")) && domain.families("Grid", GRID5, "defence").length > 0);
  assert.ok(!domain.families("Grid", GRID5, "reward").some(id => id.startsWith("hate_")), "rewards and defence goals are separate lists");
  // The page's controls run through the model with this domain: a new world takes its first offered instantiation.
  const classic = seedSetupSettings("grid-classic");
  const toInt = applySettingsChange(classic, { objectType: "Int" }, domain);
  assert.deepEqual([toInt.typeArgs, toInt.excludedFamilies, toInt.startingObjectCount], [{ min: 0, max: 9999 }, [], classic.startingObjectCount]);
  assert.throws(() => applySettingsChange(classic, { typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" } }, domain), /not offered/);
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

/** The Grid instantiations the shipped calibration tables cover (manifest order), as the engine offers them. */
const SHIPPED = [[4, "base10", "rgb"], [5, "base10", "rgby"], [6, "base16", "rainbow6"], [7, "cards", "rainbow6"], [4, "base12", "rgby"],
  [5, "cards", "rgb"], [5, "base10", "rgb"], [5, "cards", "rainbow6"], [6, "base10", "rgby"]] as const;
const GRID = { id: "Grid", params: objectType("Grid").params, defaults: objectType("Grid").defaults,
  offered: SHIPPED.map(([size, symbols, colours]) => ({ args: { size, symbols, colours } })) };

test("the board shape is one control per argument; an uncalibrated combination is disabled with the reason, never hidden", () => {
  const controls = argChoices(GRID, GRID5);
  assert.deepEqual(controls.map(c => c.param.id), ["size", "symbols", "colours"], "size, symbols and colours, from the type's params");
  const [size, symbols, colours] = controls;
  assert.deepEqual(size!.choices.map(c => c.value), [4, 5, 6, 7], "3×3 is retired: no offered board uses it");
  assert.deepEqual(size!.choices.map(c => [c.value, c.enabled]), [[4, false], [5, true], [6, true], [7, false]], "5×5 → 6×6 keeps digits and four colours");
  assert.equal(size!.choices[0]!.reason, "No calibration tables for Grid 4×4 · Digits 0–9 · Red, yellow, green, blue yet");
  assert.deepEqual(symbols!.choices.map(c => [c.value, c.enabled]), [["base10", true], ["base12", false], ["base16", false], ["cards", false]]);
  assert.deepEqual(colours!.choices.map(c => [c.value, c.enabled]), [["rgb", true], ["rgby", true], ["rainbow6", false]]);
  assert.deepEqual([size!.current, symbols!.current, colours!.current], [5, "base10", "rgby"]);
  // Int: its own arguments, the same rule (only the two shipped ranges are calibrated).
  const int = { id: "Int", params: objectType("Int").params, defaults: objectType("Int").defaults,
    offered: [{ args: { min: -2147483648, max: 2147483647 } }, { args: { min: 0, max: 9999 } }] };
  const [min, max] = argChoices(int, { min: 0, max: 9999 });
  assert.deepEqual(min!.choices.map(c => [c.value, c.enabled]), [[-2147483648, false], [0, true]]);
  assert.deepEqual(max!.choices.map(c => [c.value, c.enabled]), [[2147483647, false], [9999, true]]);
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
