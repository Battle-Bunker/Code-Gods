/**
 * The configuration page's model (archive configure.tsx + settings-form.ts, ported onto v2's preset + overrides). What
 * would break: a `room.settings` override with no question on the page (the owner cannot set it), an override sent
 * for a value equal to the setup's own (a later setup change would keep a stale number), minutes sent as seconds, a
 * value the server refuses sent instead of explained in v1's words, and a Review that hides what changes.
 */
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { AFFORDANCES } from "@workspace/v2-affordances";
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { isHidden, saveArgs, setupNameProblem, DEFAULT_COMPUTE_MS, DEFAULT_PAUSE_SECONDS, DEFAULT_STEP_BUDGET, FIELDS, SECTIONS, draftErrors, draftOf, fieldsOf, overridesFor, reviewDiff, choiceLabel, formatValue, stepChoices, lengthLine } from "../src/site/lib/configure-form.ts";

const beginner = presetOf("lines-beginner");

test("every override room.settings accepts has a question on the page, and nothing else does", () => {
  const params = AFFORDANCES["room.settings"].params as unknown as { shape: { overrides: { unwrap(): { shape: Record<string, unknown> } } } };
  const accepted = Object.keys(params.shape.overrides.unwrap().shape).sort();
  assert.deepEqual(Object.keys(FIELDS).sort(), accepted);
});

test("sections keep v1's order, and only sections with a question show", () => {
  const ids = SECTIONS.map(s => s.id);
  assert.equal(ids[0], "setup");
  assert.equal(ids.at(-1), "review");
  for (const s of SECTIONS) if (s.id !== "setup" && s.id !== "players" && s.id !== "review") assert.ok(fieldsOf(s.id).length > 0, `${s.id} has questions`);
  assert.ok(ids.indexOf("goals") < ids.indexOf("energy") && ids.indexOf("energy") < ids.indexOf("time"));
  // asked first, then "More"
  const time = fieldsOf("time");
  assert.ok(time.indexOf("planningSeconds") < time.indexOf("pauseSeconds"));
});

test("the draft is the setup's values with the room's overrides on top; unchanged values are never sent", () => {
  const d = draftOf(beginner, { planningSeconds: 120 });
  assert.equal(d.planningSeconds, 120);
  assert.equal(d.worldSeconds, beginner.worldSeconds);
  assert.equal(d.pauseSeconds, 180);
  assert.equal(d.commitClause, false);
  assert.equal(d.startingObjects, beginner.startingObjects);
  assert.equal(d.powerPerSecond, beginner.economy.powerPerSecond);
  assert.equal(d.stepBudget, 500_000, "the sandbox's default");
  assert.deepEqual(overridesFor(d, beginner), { planningSeconds: 120 });
  assert.deepEqual(overridesFor(draftOf(beginner, {}), beginner), {});
  assert.deepEqual(overridesFor({ ...d, planningSeconds: beginner.planningSeconds, worldSeconds: beginner.worldSeconds + 60 }, beginner), { worldSeconds: beginner.worldSeconds + 60 });
});

test("a value outside the server's range is explained in v1's words and blocks saving", () => {
  assert.deepEqual(draftErrors(draftOf(beginner, {})), {});
  const e = draftErrors({ ...draftOf(beginner, {}), planningSeconds: 2, worldSeconds: 90.5, startingEnergy: -1, scoreIntervalSeconds: Number.NaN });
  assert.equal(e.planningSeconds, "Must be between 5 and 900 seconds.");
  assert.equal(e.worldSeconds, "Must be a whole number.");
  assert.equal(e.startingEnergy, "Must be at least 0 energy.");
  assert.equal(e.scoreIntervalSeconds, "Enter a number.");
});

test("stepped choices always contain the current value, sorted", () => {
  assert.deepEqual(stepChoices("planningSeconds", 45), [30, 45, 60, 120, 300]);
  assert.deepEqual(stepChoices("planningSeconds", 60), [30, 60, 120, 300]);
});

test("values and choices read as v1 wrote them", () => {
  assert.equal(choiceLabel("worldSeconds", 300), "Normal (5 min)");
  assert.equal(choiceLabel("durationMode", "halfLife"), "Half-life");
  assert.equal(choiceLabel("scoreIntervalSeconds", 10), "every 10 s");
  assert.equal(choiceLabel("peerNoiseVariance", 0), "Exact");
  assert.equal(choiceLabel("readPriceWeight", 0), "Free");
  assert.equal(choiceLabel("commitClause", true), "Offered");
  assert.equal(formatValue("startingEnergy", 600), "600 energy");
  assert.equal(formatValue("driftSeconds", 0), "never");
  assert.equal(choiceLabel("opportunitiesPerSecond", 100), "Normal (100/s)");
  assert.equal(choiceLabel("birthsPerSecond", 1 / 240), "1 every 240 s");
  assert.equal(choiceLabel("birthsPerSecond", 0), "None");
  assert.equal(choiceLabel("fullChargeSeconds", 240), "4 min");
});

test("the length line never adds planning to the game", () => {
  assert.equal(lengthLine({ planningSeconds: 75, worldSeconds: 300, durationMode: "fixed" }), "75 s planning, then a 5 min game");
  assert.match(lengthLine({ planningSeconds: 60, worldSeconds: 300, durationMode: "halfLife" }), /^1 min planning, then about 5 min \(ends at a hidden moment/);
});

test("Review lists each change in page order as label: before → after, the setup first", () => {
  const saved = { preset: beginner.id, draft: draftOf(beginner, {}) };
  assert.deepEqual(reviewDiff(saved, saved), []);
  const next = { preset: beginner.id, draft: { ...saved.draft, planningSeconds: 120, commitClause: true } };
  assert.deepEqual(reviewDiff(saved, next), [
    { key: "commitClause", label: "Conditional moves", from: "off", to: "offered" },
    { key: "planningSeconds", label: "Planning", from: "1 min", to: "2 min" },
  ]);
  const other = presetOf("lines-beginner-bidding");
  const moved = reviewDiff(saved, { preset: other.id, draft: draftOf(other, {}) });
  assert.deepEqual(moved[0], { key: "preset", label: "Setup", from: beginner.title, to: other.title });
});

test("the page's pause default is the server's (a room left on it records no override)", () => {
  const loop = readFileSync(new URL("../../engine/convex/v2/loop.ts", import.meta.url), "utf8");
  assert.equal(Number(loop.match(/export const DEFAULT_PAUSE_SECONDS = (\d+);/)?.[1]), DEFAULT_PAUSE_SECONDS);
});

test("the page's compute defaults are the sandbox's (a room left on them records no override)", () => {
  const limits = readFileSync(new URL("../../../lib/v2-sandbox/src/limits.ts", import.meta.url), "utf8");
  assert.match(limits, new RegExp(`DEFAULT_LIMITS = Object\\.freeze\\(\\{ stepBudget: ${DEFAULT_STEP_BUDGET.toLocaleString("en-US").replace(/,/g, "_")}, hostCallCap: \\d+, wallMs: ${DEFAULT_COMPUTE_MS} \\}`));
});

test("defence goals are asked on grid setups only, and never sent for a lines setup (the server refuses them there)", () => {
  const grids = presetOf("grids-beginner");
  assert.ok(FIELDS.defenceGoals.only!(grids) && !FIELDS.defenceGoals.only!(beginner));
  const on = { ...draftOf(beginner, {}), defenceGoals: true, penaltyWeight: 2 };
  assert.deepEqual(overridesFor(on, beginner), {});
  assert.deepEqual(overridesFor({ ...draftOf(grids, {}), defenceGoals: true, penaltyWeight: 2 }, grids), { defenceGoals: true, penaltyWeight: 2 });
});

test("rules never dealt: a set (order does not matter), never all of the setup's, and the bid questions only where there is bidding", () => {
  const bidding = presetOf("lines-beginner-bidding");
  const d = draftOf(bidding, {});
  assert.deepEqual(overridesFor({ ...d, excludedFamilies: [] }, bidding), {});
  assert.deepEqual(overridesFor({ ...d, excludedFamilies: [bidding.families[1]!, bidding.families[0]!] }, bidding), { excludedFamilies: [bidding.families[1], bidding.families[0]] });
  const saved = { preset: bidding.id, draft: { ...d, excludedFamilies: [bidding.families[0]!, bidding.families[1]!] } };
  assert.deepEqual(reviewDiff(saved, { preset: bidding.id, draft: { ...d, excludedFamilies: [bidding.families[1]!, bidding.families[0]!] } }), [], "the same set is no change");
  assert.equal(draftErrors({ ...d, excludedFamilies: [...bidding.families] }, bidding).excludedFamilies, `Leave at least ${bidding.minPlayers} rule families to deal, one for each player.`);
  assert.equal(draftErrors({ ...d, excludedFamilies: bidding.families.slice(bidding.minPlayers) }, bidding).excludedFamilies, undefined, "one per player is enough");
  assert.equal(formatValue("excludedFamilies", ["x", "y"]), "2 rules");
  assert.equal(choiceLabel("bidPricing", "second"), "Second price");
  assert.equal(choiceLabel("bidDisclosure", "none"), "Own result only");
  assert.equal(isHidden("bidPricing", beginner), true);
  assert.equal(isHidden("bidPricing", bidding), false);
  assert.equal(isHidden("excludedFamilies", beginner), false);
  assert.equal(isHidden("bidPricing", beginner, { bidSeconds: 30 }), false, "v1: any setup may bid");
  assert.equal(isHidden("bidPricing", bidding, { bidSeconds: 0 }), true, "0 is no bid phase");
  assert.equal(d.bidSeconds, bidding.bid!.seconds);
  assert.deepEqual(overridesFor({ ...d, bidSeconds: 0 }, bidding), { bidSeconds: 0 });
  assert.equal(d.bidPricing, bidding.bid!.pricing);
});

test("Save applies a saved setup by its id while the page holds exactly that setup, else the preset and overrides", () => {
  const d = draftOf(beginner, { planningSeconds: 120 });
  const setup = { setupId: "s1", name: "Slow start", preset: beginner.id, overrides: { planningSeconds: 120 } };
  assert.deepEqual(saveArgs({ preset: beginner.id, draft: d }, beginner.id, setup), { setupId: "s1" });
  assert.deepEqual(saveArgs({ preset: beginner.id, draft: { ...d, planningSeconds: 60 } }, beginner.id, setup), { overrides: {} }, "changed by hand after loading it");
  assert.deepEqual(saveArgs({ preset: beginner.id, draft: d }, beginner.id, null), { overrides: { planningSeconds: 120 } });
  const other = presetOf("lines-beginner-bidding");
  assert.deepEqual(saveArgs({ preset: other.id, draft: draftOf(other, {}) }, beginner.id, null), { preset: other.id, overrides: {} });
});

test("a setup's name: 1 to 40 characters once trimmed (v1's words)", () => {
  assert.equal(setupNameProblem("  "), "Give the setup a name.");
  assert.equal(setupNameProblem("x".repeat(41)), "At most 40 characters.");
  assert.equal(setupNameProblem("  Slow start "), null);
});
