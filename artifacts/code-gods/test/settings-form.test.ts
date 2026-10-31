/**
 * The configuration page's rules (onboarding-and-config.md §4.2, §4.4): limits as the engine enforces them, the
 * settings model's domain built from the manifest, which setup a room is on, stepped choices and the summary lines.
 * The dependencies themselves are game-core's (settings-model.test.ts); here only what the page adds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, applySettingsChange, seedSetupSettings } from "@workspace/game-core";
import {
  SECTIONS, choiceLabel, currentSetup, draftErrors, fieldError, fieldsOf, isHidden, lengthLine, paceWord, settingsDomain, shelfEntries, stepChoices,
} from "../src/lib/settings-form.ts";

const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };
/** A manifest's object types as the engine sends them, hand-cut to three offered instantiations. */
const types = [
  { id: "Int", defaults: { min: -2147483648, max: 2147483647 }, offered: [{ key: "Int(0,9999)", args: { min: 0, max: 9999 } }] },
  { id: "Grid", defaults: { size: 4, symbols: "base10", colours: "rgb" }, offered: [{ key: "Grid(5,base10,rgby)", args: GRID5 }, { key: "Grid(7,cards,rainbow6)", args: GRID7 }] },
];

test("the sections run World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with no Start from", () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ["world", "goals", "agents", "energy", "population", "time", "players", "review"]);
  assert.deepEqual(fieldsOf("goals"), ["utilitySelectorId", "defenceRate", "excludedFamilies", "penaltyWeight", "priorId"], "asked, then more, then fixed");
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
  assert.equal(fieldError("defenceRate", 1.5), "Must be between 0 and 1.");
  assert.equal(fieldError("planningSeconds", NaN), "Enter a number.");
  const grid = seedSetupSettings("grid-classic");
  assert.deepEqual(draftErrors(grid), {});
  assert.deepEqual(Object.keys(draftErrors({ ...grid, stepBudget: 0 })), ["stepBudget"]);
  assert.equal(draftErrors({ ...grid, startingEnergy: null as unknown as number }).startingEnergy, "Enter a number.", "an emptied field (NaN, stored as null) is an error, not 0");
  assert.match(draftErrors({ ...grid, utilitySelectorId: "nope" })._form ?? "", /utilitySelectorId/);
});

test("the domain offers exactly the manifest's instantiations, and the families of each from the shipped catalogue", () => {
  const domain = settingsDomain(types);
  assert.deepEqual(domain.offered("Grid"), [GRID5, GRID7]);
  assert.deepEqual(domain.offered("string"), [], "a type the manifest does not list offers nothing");
  assert.ok(domain.families("Grid", GRID5).includes("ladder_of_numbers"));
  assert.ok(!domain.families("Grid", GRID7).includes("ladder_of_numbers"), "a locked family does not exist on that board");
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
});

test("the room's setup: the one its origin names while the settings still match, else any setup with the same settings, else custom", () => {
  const classic = seedSetupSettings("grid-classic");
  const setups = [{ id: "a", settings: classic }, { id: "b", settings: { ...classic } }, { id: "c", settings: seedSetupSettings("grid-big") }];
  assert.equal(currentSetup(classic, { kind: "setup", id: "b", modified: false }, setups)?.id, "b", "two identical setups: the one the room was put on");
  assert.equal(currentSetup(classic, null, setups)?.id, "a", "no origin: the first setup with these settings");
  assert.equal(currentSetup(Object.fromEntries(Object.entries(classic).reverse()) as typeof classic, { kind: "preset", id: "grid-classic", modified: false }, setups)?.id, "a",
    "a legacy origin is matched by settings, in any key order");
  assert.equal(currentSetup({ ...classic, planningSeconds: 1 }, { kind: "setup", id: "a", modified: true }, setups), undefined, "changed: custom");
  assert.equal(currentSetup(classic, { kind: "setup", id: "c", modified: false }, setups)?.id, "a", "the origin's setup was edited since: matched by settings");
});

test("penalty weight hides while no defence goals are dealt; stepped choices keep the current value; summary lines", () => {
  assert.equal(isHidden("penaltyWeight", { ...DEFAULT_SETTINGS, defenceRate: 0 }), true);
  assert.equal(isHidden("penaltyWeight", { ...DEFAULT_SETTINGS, defenceRate: 0.5 }), false);
  assert.deepEqual(stepChoices("pauseSeconds", 180), [60, 180, 300]);
  assert.deepEqual(stepChoices("pauseSeconds", 240), [60, 180, 240, 300]);
  assert.equal(lengthLine({ planningSeconds: 60, halfLifeSeconds: 300 }), "~6 min (often 3–13)");
  assert.deepEqual(stepChoices("interactionRateHz", 25).map(v => choiceLabel("interactionRateHz", v)), ["Slow (25/s)", "Normal (100/s)", "Fast (300/s)", "Max (1,000/s)"]);
  assert.deepEqual([30, 60, 90].map(v => choiceLabel("planningSeconds", v)), ["30 s", "1 min", "90 s"]);
  assert.equal(choiceLabel("defenceRate", 0.25), "25%");
  assert.equal(choiceLabel("commitClause", true), "Offered");
  assert.equal(paceWord(25), "slow");
  assert.equal(paceWord(100), "normal");
  assert.equal(paceWord(300), "fast");
});
