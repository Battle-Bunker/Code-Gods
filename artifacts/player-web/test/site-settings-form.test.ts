/**
 * The configuration page's rules (onboarding-and-config.md §4.2, §4.4): limits as the engine enforces them, the
 * settings model's domain built from the manifest, the per-argument shape controls, the setup combobox's search and
 * ownership words, stepped choices and the summary lines.
 * The dependencies themselves are game-core's (settings-model.test.ts); here only what the page adds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, applySettingsChange, defaultSettingsFor, seedSetupSettings, supportedCostModels } from "@workspace/game-core";
import { COST_MODELS, objectType } from "@workspace/game-types";
import {
  SECTIONS, LABELS, ROOM_DETAILS, argChoices, choiceLabel, costModelChoices, formatValue, toggleLanguage, dealerNote, formatSeconds, defenceBlocker, draftErrors, fieldError, fieldsOf, firstUseNote, isHidden, lengthLine, bidLine, paceWord,
  settingsDomain, shelfEntries, stepChoices,
} from "../src/site/lib/settings-form.ts";
import { editBlocker, freeName, ownerLabel } from "../src/site/lib/setup-words.ts";

const GRID5 = { size: 5, symbols: "base10", colours: "rgby" };
const GRID7 = { size: 7, symbols: "cards", colours: "rainbow6" };
/** A manifest's object types as the engine sends them, hand-cut to two listed instantiations. */
const types = [
  { id: "Grid", defaults: { size: 4, symbols: "base10", colours: "rgb" }, playable: [{ key: "Grid(5,base10,rgby)", args: GRID5 }, { key: "Grid(7,cards,rainbow6)", args: GRID7 }] },
];

test("the sections run World → Goals → Agents → Energy → Population → Time → Players & AI → Review, with no Start from", () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ["world", "goals", "agents", "energy", "population", "time", "players", "review"]);
  assert.deepEqual(fieldsOf("goals"), ["utilitySelectorId", "defenceGoals", "excludedDefenceFamilies", "bidSeconds", "excludedFamilies", "penaltyWeight", "priorId", "bidPricing", "bidVisibility", "bidDisclosure"], "asked, then more");
  assert.deepEqual(fieldsOf("world"), ["objectType", "typeArgs", "languages"], "the grammar and summon price follow each agent's language");
  assert.deepEqual(fieldsOf("population"), ["startingObjectCount", "spawnRateHz", "spawnFunctionId", "objectSelection"]);
});

test("limits mirror validateSettings and the engine's resource limits, with the message on the field", () => {
  assert.equal(fieldError("maxAgentsPerGod", 0), "Must be between 1 and 200 agents.");
  assert.equal(fieldError("maxAgentsPerGod", 2.5), "Must be a whole number.");
  assert.equal(fieldError("maxAgentsPerGod", 200), null);
  assert.equal(fieldError("startingObjectCount", 1001), "Must be between 0 and 1,000 objects.", "nextSettings caps objects at 1000");
  // The engine refuses these above ENERGY_LIMITS (game-core validateSettings): the form says so before saving.
  assert.equal(fieldError("powerPerSecond", 1_000_001), "Must be between 0 and 1,000,000 ⚡ per second.");
  assert.equal(fieldError("startingEnergy", 1e9 + 1), "Must be between 0 and 1,000,000,000 ⚡.");
  assert.equal(fieldError("penaltyWeight", 1001), "Must be between 0 and 1,000.");
  assert.equal(fieldError("penaltyWeight", 1000), null);
  assert.equal(fieldError("spawnRateHz", 10.5), "Must be between 0 and 10 per second.");
  assert.equal(fieldError("halfLifeSeconds", 0), "Must be between 1 and 1,000,000,000 seconds.");
  assert.equal(fieldError("pauseSeconds", 3601), "Must be between 1 and 3,600 seconds.");
  assert.equal(fieldError("scoreIntervalSeconds", 2.5), "Must be a whole number.");
  assert.equal(fieldError("scoreIntervalSeconds", 45), null, "any whole number of seconds, not only the presets");
  assert.equal(fieldError("powerPerSecond", -1), "Must be between 0 and 1,000,000 ⚡ per second.");
  assert.ok(fieldsOf("energy").includes("powerPerSecond"), "each player's power is on the form");
  // The time an empty energy store takes to fill: asked in the energy section, in seconds, 1 to 1,000,000.
  assert.ok(fieldsOf("energy").includes("fullChargeSeconds"));
  assert.equal(fieldError("fullChargeSeconds", 0), "Must be between 1 and 1,000,000 seconds.");
  assert.equal(fieldError("fullChargeSeconds", 30), null);
  assert.ok(!fieldsOf("energy").some(k => ["energyPerSecond", "agentEnergyPerSecond", "agentBatteryActs", "perActFloorBits"].includes(k)), "the old income, battery and floor settings are gone");
  assert.equal(fieldError("planningSeconds", NaN), "Enter a number.");
  const grid = defaultSettingsFor("Grid", ["python"], GRID5);
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
  assert.deepEqual(domain.playable("Tree"), [], "a type the manifest does not list lists nothing");
  assert.equal(domain.isPlayable!("Grid", { size: 6, symbols: "base16", colours: "rainbow6" }), true, "no table needed");
  assert.equal(domain.isPlayable!("Grid", { size: 3, symbols: "base10", colours: "rgb" }), false, "3×3 is retired");
  assert.ok(domain.families("Grid", GRID5, "reward").includes("ladder_of_numbers"));
  assert.ok(!domain.families("Grid", GRID7, "reward").includes("ladder_of_numbers"), "a locked family does not exist on that board");
  assert.ok(domain.families("Grid", GRID5, "defence").every(id => id.startsWith("hate_")) && domain.families("Grid", GRID5, "defence").length > 0);
  assert.ok(!domain.families("Grid", GRID5, "reward").some(id => id.startsWith("hate_")), "rewards and defence goals are separate lists");
  // The page's controls run through the model with this domain: a room stored on a removed object type (Int) moves to
  // the first listed Grid instantiation (the default board is not listed here), keeping the owner's other choices.
  const classic = defaultSettingsFor("Grid", ["python"], GRID5);
  const removed = { ...classic, objectType: "Int", typeArgs: { min: 0, max: 9999 }, excludedFamilies: ["removed_rule"] };
  const toGrid = applySettingsChange(removed, { objectType: "Grid" }, domain);
  assert.deepEqual([toGrid.typeArgs, toGrid.excludedFamilies, toGrid.startingObjectCount], [GRID5, [], classic.startingObjectCount]);
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
});

/** The playable Grid shapes as the engine lists them (every size 4–7 × symbols × colours); some prepare tables first. */
const GRID = { id: "Grid", params: objectType("Grid").params, defaults: objectType("Grid").defaults,
  playable: [4, 5, 6, 7].flatMap(size => ["base10", "base12", "base16", "cards"].flatMap(symbols => ["rgb", "rgby", "rainbow6"].map(colours => ({
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
  // A retired combination (the current value kept on screen) is disabled with the reason.
  const retired = argChoices(GRID, { size: 3, symbols: "base10", colours: "rgb" })[1]!;
  assert.ok(retired.choices.every(c => !c.enabled && /retired/.test(c.reason!)));
});

test("a shape whose first game computes tables says so with the measured time; the dealer says when it deals like the Divine Lottery", () => {
  assert.equal(firstUseNote(GRID, GRID5), null, "every table shipped or analytic: nothing to say");
  assert.equal(firstUseNote(GRID, GRID7), "The first game on this shape on this server prepares up to 12 rule tables (about 4 min 20 s) before planning starts; later games start at once.");
  const one = { ...GRID, playable: [{ args: GRID5, prepare: null }] };
  assert.match(firstUseNote(one, { size: 6, symbols: "base16", colours: "rainbow6" })!, /prepares its rule tables \(about 30 s\)/, "an unlisted board: the type's measured estimate");
  assert.equal(dealerNote(GRID, { typeArgs: GRID5, utilitySelectorId: "fair-aligned", priorId: "uniform" }), null, "synergy measured");
  assert.match(dealerNote(GRID, { typeArgs: GRID5, utilitySelectorId: "fair-aligned", priorId: "other" })!, /deals like the Divine Lottery/, "but not under this prior");
  assert.match(dealerNote(GRID, { typeArgs: GRID7, utilitySelectorId: "fair-aligned", priorId: "uniform" })!, /deals like the Divine Lottery/);
  assert.equal(dealerNote(GRID, { typeArgs: GRID7, utilitySelectorId: "divine-lottery", priorId: "uniform" }), null);
  assert.deepEqual([35, 89.6, 119.6, 120, 260].map(formatSeconds), ["35 s", "1 min 30 s", "2 min", "2 min", "4 min 20 s"], "rounded once, never \"1 min 60 s\"");
});

test("the setup combobox: whose it is; why Edit is unavailable (the search is the engine's, test/game-setups.test.ts)", () => {
  const setups = [
    { id: "1", name: "Classic", summary: "5×5 with four colours", ownerName: "System", system: true, mine: false, editable: false },
    { id: "2", name: "Classic's copy", summary: "5×5 with four colours", ownerName: "Ada Lovelace", system: false, mine: true, editable: true },
    { id: "3", name: "Big cards", summary: "Grid 7×7 · Playing cards", ownerName: "Bo Diddley", system: false, mine: false, editable: false },
  ];
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
  assert.deepEqual(stepChoices("fullChargeSeconds", 30), [10, 30, 60, 120, 300], "the suggested steps come from SETTINGS_DOCS");
  assert.deepEqual(stepChoices("fullChargeSeconds", 45), [10, 30, 45, 60, 120, 300]);
  assert.equal(formatValue("fullChargeSeconds", 30), "30 s");
  // Energy reads in ⚡, as everywhere in the game (a walker did not know what "600 bits" meant); the engine's docs keep bits.
  assert.equal(formatValue("startingEnergy", 600), "600 ⚡");
  assert.equal(formatValue("powerPerSecond", 64), "64 ⚡/s");
  assert.deepEqual(stepChoices("pauseSeconds", 240), [60, 180, 240, 300]);
  // Catches: the summary adding planning to the game ("15 min") beside a Time field that says "Long (10 min)".
  assert.equal(lengthLine({ planningSeconds: 60, halfLifeSeconds: 300 }), "1 min planning, then about 5 min (ends at a hidden moment, often after 2 to 12 min)");
  assert.equal(lengthLine({ planningSeconds: 300, halfLifeSeconds: 600, durationMode: "fixed" }), "5 min planning, then a 10 min game", "a fixed game's length is exact");
  assert.equal(lengthLine({ planningSeconds: 75, halfLifeSeconds: 300, durationMode: "fixed" }), "75 s planning, then a 5 min game");
  assert.equal(lengthLine({ planningSeconds: 0, halfLifeSeconds: 300, durationMode: "fixed" }), "a 5 min game");
  assert.deepEqual(stepChoices("durationMode", "fixed").map(v => choiceLabel("durationMode", v)), ["Fixed duration", "Half-life"]);
  assert.deepEqual(stepChoices("scoreIntervalSeconds", 45), [5, 10, 20, 30, 45, 60], "a custom value joins the presets");
  assert.deepEqual(stepChoices("interactionRateHz", 25).map(v => choiceLabel("interactionRateHz", v)), ["Slow (25/s)", "Normal (100/s)", "Fast (300/s)", "Max (1,000/s)"]);
  assert.deepEqual([30, 60, 90].map(v => choiceLabel("planningSeconds", v)), ["30 s", "1 min", "90 s"]);
  assert.deepEqual([true, false].map(v => choiceLabel("defenceGoals", v)), ["On: everyone", "Off"]);
  assert.equal(choiceLabel("commitClause", true), "Offered");
  assert.equal(paceWord(25), "slow");
  assert.equal(paceWord(100), "normal");
  assert.equal(paceWord(300), "fast");
});

test("the bid phase on the form: bidding time in whole seconds up to 10 minutes, zero reads as no bidding; the price rule hides without a bid phase", () => {
  assert.equal(LABELS.bidSeconds, "Bidding time");
  assert.equal(LABELS.bidPricing, "Bid price");
  assert.equal(fieldError("bidSeconds", 0), null);
  assert.equal(fieldError("bidSeconds", 600), null);
  assert.equal(fieldError("bidSeconds", 601), "Must be between 0 and 600 seconds.");
  assert.equal(fieldError("bidSeconds", -1), "Must be between 0 and 600 seconds.");
  assert.equal(fieldError("bidSeconds", 1.5), "Must be a whole number.");
  assert.equal(draftErrors({ ...DEFAULT_SETTINGS, bidSeconds: 601 }).bidSeconds, "Must be between 0 and 600 seconds.");
  assert.deepEqual(draftErrors({ ...DEFAULT_SETTINGS, bidSeconds: 30, bidPricing: "second" }), {});
  assert.equal(formatValue("bidSeconds", 0), "No bidding");
  assert.equal(formatValue("bidSeconds", 30), "30 s");
  assert.equal(formatValue("bidPricing", "first"), "First price");
  assert.equal(formatValue("bidPricing", "second"), "Second price");
  assert.deepEqual(stepChoices("bidSeconds", 0).map(v => choiceLabel("bidSeconds", v)), ["No bidding", "20 s", "30 s", "45 s", "1 min", "2 min"]);
  assert.deepEqual(stepChoices("bidSeconds", 50), [0, 20, 30, 45, 50, 60, 120], "a custom time joins the presets");
  assert.deepEqual(stepChoices("bidPricing", "first").map(v => choiceLabel("bidPricing", v)), ["First price", "Second price"]);
  assert.equal(isHidden("bidPricing", { ...DEFAULT_SETTINGS, bidSeconds: 0 }), true, "nothing is bid, so nothing is paid");
  assert.equal(isHidden("bidPricing", { ...DEFAULT_SETTINGS, bidSeconds: 30 }), false);
  assert.equal(isHidden("bidSeconds", DEFAULT_SETTINGS), false);
  // The line a rules summary shows: only for a game with a bid phase (one started before the setting has none).
  assert.equal(bidLine({ bidSeconds: 0, bidPricing: "first" }), null);
  assert.equal(bidLine({}), null);
  assert.equal(bidLine({ bidSeconds: 30, bidPricing: "first" }), "30 s, first price");
  assert.equal(bidLine({ bidSeconds: 120, bidPricing: "second" }), "120 s, second price");
  assert.equal(bidLine({ bidSeconds: 30 }), "30 s, first price");
});

test("the cost model: a choice under Energy › More, offered where the world has more than one, read as set-v1 when absent", () => {
  assert.deepEqual(fieldsOf("energy"), ["startingEnergy", "powerPerSecond", "fullChargeSeconds", "costModel"], "asked, then more");
  assert.equal(LABELS.costModel, "Change pricing");
  const classic = defaultSettingsFor("Grid", ["python"], GRID5), basics = seedSetupSettings("grid-annotated-basics");
  assert.deepEqual(costModelChoices(classic), supportedCostModels(classic), "the models the world offers (game-core), the default first");
  assert.deepEqual(costModelChoices(classic).slice(0, 2), ["set-v1", "distance-v1"]);
  assert.deepEqual(costModelChoices(classic).slice(0, 2).map(v => choiceLabel("costModel", v)), ["Flat: every change alike", "Distance: further costs more"]);
  for (const v of COST_MODELS) assert.match(choiceLabel("costModel", v), /^[A-Z][a-z]+: /, `${v} has a label in plain words`);
  assert.equal(choiceLabel("costModel", "future-v2"), "Future", "a model without words yet shows its name, not its id");
  assert.equal(isHidden("costModel", classic), false);
  // The 7×7 cards in six colours offer only the default (a full look there would cost more than its cheapest change).
  const cards = { ...classic, typeArgs: GRID7, excludedFamilies: [] };
  assert.deepEqual(costModelChoices(cards), ["set-v1"]);
  assert.equal(isHidden("costModel", cards), true, "one model: nothing to choose");
  assert.equal(formatValue("costModel", classic.costModel), "Flat: every change alike", "absent is the default");
  assert.equal(formatValue("costModel", basics.costModel), "Distance: further costs more", "the default setup prices by distance");
  // A pick goes through the settings model: the default is the field's absence, so picking it back leaves no unsaved change.
  const domain = settingsDomain([{ id: "Grid", playable: [{ args: classic.typeArgs }, { args: GRID7 }] }]);
  const picked = applySettingsChange(classic, { costModel: "distance-v1" }, domain);
  assert.deepEqual(draftErrors(picked, domain), {});
  assert.deepEqual(applySettingsChange(picked, { costModel: "set-v1" }, domain), classic);
  assert.ok(!("costModel" in applySettingsChange(picked, { typeArgs: GRID7 }, domain)), "a board without the model drops it");
  assert.match(draftErrors({ ...cards, costModel: "distance-v1" }, domain)._form ?? "", /costModel distance-v1 is not offered/);
});

test("the picker's Lab heading goes before the first Lab setup, and before each one that follows an ordinary setup in a search", async () => {
  const { labStartsAt } = await import("../src/site/lib/setup-words.ts");
  const list = [{}, {}, { lab: true }, { lab: true }];
  assert.deepEqual(list.map((_, i) => labStartsAt(list, i)), [false, false, true, false], "one heading for the catalogue's Lab tail");
  const found = [{ lab: true }, {}, { lab: true }];
  assert.deepEqual(found.map((_, i) => labStartsAt(found, i)), [true, false, true]);
  assert.deepEqual([{}, {}].map((_, i, all) => labStartsAt(all, i)), [false, false], "no heading for anyone who is sent no Lab setup");
});
