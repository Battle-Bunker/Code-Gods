/**
 * The configuration page's model (archive configure.tsx + settings-form.ts, ported onto v2's preset + overrides). What
 * would break: a `room.settings` override with no question on the page (the owner cannot set it), an override sent
 * for a value equal to the setup's own (a later setup change would keep a stale number), minutes sent as seconds, a
 * value the server refuses sent instead of explained in v1's words, and a Review that hides what changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AFFORDANCES } from "@workspace/v2-affordances";
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { FIELDS, SECTIONS, draftErrors, draftOf, fieldsOf, overridesFor, reviewDiff, choiceLabel, formatValue, stepChoices, lengthLine } from "../src/site/lib/configure-form.ts";

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
