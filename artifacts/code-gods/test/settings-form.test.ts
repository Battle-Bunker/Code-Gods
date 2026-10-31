/**
 * The configuration page's rules (onboarding-and-config.md §4.2, §4.4): limits as the engine enforces them,
 * dependencies (retuning, language, hidden penalty weight), stepped choices, preset matching, the diff, the summary
 * lines and the three-way merge that never discards the owner's draft.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, WEAK_GRID_FAMILIES, presetSettings, defaultSettingsFor } from "@workspace/game-core";
import {
  draftErrors, fieldError, fieldsOf, isHidden, lengthLine, matchPreset, paceWord, retune, settingsDiff, stepChoices, threeWayMerge, withLanguage,
} from "../src/lib/settings-form.ts";

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
  const grid = presetSettings("grid-classic");
  assert.deepEqual(draftErrors(grid), {});
  assert.deepEqual(Object.keys(draftErrors({ ...grid, stepBudget: 0 })), ["stepBudget"]);
  assert.match(draftErrors({ ...grid, utilitySelectorId: "nope" })._form ?? "", /utilitySelectorId/);
});

test("a new object type retunes only the fields still at the old tuned defaults, and names them", () => {
  const int = defaultSettingsFor("Int");
  const { settings, moved } = retune({ ...int, planningSeconds: 30, spawnRateHz: 0.7 }, { objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" } });
  assert.equal(settings.startingObjectCount, 80);
  assert.equal(settings.agentEnergyPerSecond, 32);
  assert.deepEqual(settings.excludedFamilies, WEAK_GRID_FAMILIES);
  assert.equal(settings.spawnRateHz, 0.7, "an owner's own value stays");
  assert.equal(settings.planningSeconds, 30);
  assert.deepEqual(moved.sort(), ["agentEnergyPerSecond", "excludedFamilies", "startingObjectCount"]);
  const small = retune(presetSettings("grid-classic"), { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgb" } });
  assert.ok(small.settings.excludedFamilies.includes("fair_weaver"), "Grid(4,base10,rgb) also excludes fair_weaver");
  assert.deepEqual(retune(int, { objectType: "Int", typeArgs: int.typeArgs }).moved, [], "same instantiation: nothing moves");
});

test("a new language moves the grammar and the summon price with it", () => {
  const ts = withLanguage(DEFAULT_SETTINGS, "typescript");
  assert.equal(ts.grammarId, "typescript-agent-v1");
  assert.equal(ts.complexityFunctionId, "ts-ast-bits-v1-uniform");
  assert.equal(ts.utilitySelectorId, DEFAULT_SETTINGS.utilitySelectorId);
});

test("penalty weight hides while no defence goals are dealt; stepped choices keep the current value", () => {
  assert.equal(isHidden("penaltyWeight", { ...DEFAULT_SETTINGS, defenceRate: 0 }), true);
  assert.equal(isHidden("penaltyWeight", { ...DEFAULT_SETTINGS, defenceRate: 0.5 }), false);
  assert.deepEqual(stepChoices("pauseSeconds", 180), [60, 180, 300]);
  assert.deepEqual(stepChoices("pauseSeconds", 240), [60, 180, 240, 300]);
  assert.deepEqual(fieldsOf("goals"), ["utilitySelectorId", "defenceRate", "excludedFamilies", "penaltyWeight", "priorId"], "asked, then more, then fixed");
});

test("the preset is matched on every field but the language; a change makes it custom", () => {
  const presets = ["grid-first-steps", "grid-classic", "grid-low-income"].map(id => ({ id, settings: presetSettings(id) }));
  assert.equal(matchPreset(presetSettings("grid-low-income"), presets)?.id, "grid-low-income", "same world as Classic, told apart");
  assert.equal(matchPreset(withLanguage(presetSettings("grid-classic"), "typescript"), presets)?.id, "grid-classic");
  assert.equal(matchPreset({ ...presetSettings("grid-classic"), planningSeconds: 120 }, presets), undefined);
});

test("the diff names each change in plain words; the summary gives length and pace", () => {
  const base = presetSettings("grid-classic");
  const diff = settingsDiff(base, { ...base, interactionRateHz: 25, defenceRate: 0.5 });
  assert.deepEqual(diff.map(d => `${d.label}: ${d.from} → ${d.to}`), ["Defence goals: off → 50% of players", "World speed: 100 acts/s → 25 acts/s"]);
  assert.equal(lengthLine({ planningSeconds: 60, halfLifeSeconds: 300 }), "~6 min (often 3–13)");
  assert.equal(paceWord(25), "slow");
  assert.equal(paceWord(100), "normal");
  assert.equal(paceWord(300), "fast");
});

test("a conflict merges disjoint changes and leaves overlapping ones to the owner; the draft is kept", () => {
  const base = { a: 1, b: 2, c: 3, d: 4 };
  const mine = { a: 10, b: 2, c: 30, d: 4 };
  const theirs = { a: 1, b: 20, c: 31, d: 4 };
  const { merged, conflicts, fromTheirs } = threeWayMerge(base, mine, theirs);
  assert.deepEqual(merged, { a: 10, b: 20, c: 30, d: 4 });
  assert.deepEqual(conflicts, ["c"]);
  assert.deepEqual(fromTheirs, ["b"]);
  assert.deepEqual(threeWayMerge(base, mine, { ...theirs, c: 30 }).conflicts, [], "the same change on both sides is no conflict");
});
