/**
 * The room's setup picker and settings (integration plan §1.2): presets grouped with the Lab for admins only, the few
 * settings a room may change as `room.settings` overrides, and the next game's summary. What would break: a player
 * offered a Lab preset, an override sent for a value equal to the preset's own (a later preset change would keep a
 * stale number), minutes sent as seconds, a value the server refuses sent instead of explained.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { formOf, isLab, nextGameSummary, overridesOf, setupGroups, setupBlurb } from "../src/site/lib/setup-picker.ts";

const beginner = presetOf("lines-beginner");
const lab = { ...beginner, id: "test-every-family-bidding", title: "Every family (tests)" };
const presets = [...PRESETS.filter(p => !isLab(p)), lab];

test("Lab presets are the ones under trial (test- and lab- ids)", () => {
  assert.equal(isLab(beginner), false);
  assert.equal(isLab(lab), true);
  assert.equal(isLab({ ...beginner, id: "lab-price-list-2" }), true);
});

test("a player sees the setups; an admin also sees the Lab group", () => {
  const player = setupGroups(presets, { admin: false, current: beginner.id });
  assert.deepEqual(player.map(g => g.label), ["Setups"]);
  assert.ok(!player[0]!.presets.some(isLab));
  const admin = setupGroups(presets, { admin: true, current: beginner.id });
  assert.deepEqual(admin.map(g => g.label), ["Setups", "Lab (admins only)"]);
  assert.deepEqual(admin[1]!.presets.map(p => p.id), [lab.id]);
});

test("a room already on a Lab preset still shows it to a player, so the picker never hides what the room plays", () => {
  const g = setupGroups(presets, { admin: false, current: lab.id });
  assert.deepEqual(g.map(x => x.label), ["Setups", "Lab (admins only)"]);
  assert.deepEqual(g[1]!.presets.map(p => p.id), [lab.id]);
});

test("each setup says in words what it plays", () => {
  assert.match(setupBlurb(beginner), /fraction/i);
  assert.ok(!PRESETS.some(p => p.variant === "line-z"), "whole-number lines are not offered");
  assert.match(setupBlurb(presetOf("lines-beginner-bidding")), /bid/i);
});

test("the form starts from the overrides, else the preset's own values, with the game length in minutes", () => {
  assert.deepEqual(formOf(beginner, {}), { planningSeconds: "60", worldMinutes: "5", startingEnergy: String(beginner.startingEnergy) });
  assert.deepEqual(formOf(beginner, { worldSeconds: 90, planningSeconds: 20 }), { planningSeconds: "20", worldMinutes: "1.5", startingEnergy: String(beginner.startingEnergy) });
});

test("only the values that differ from the preset are sent, minutes as seconds", () => {
  assert.deepEqual(overridesOf({ planningSeconds: "60", worldMinutes: "5", startingEnergy: String(beginner.startingEnergy) }, beginner), { ok: true, overrides: {} });
  assert.deepEqual(overridesOf({ planningSeconds: "15", worldMinutes: "2.5", startingEnergy: "1000" }, beginner),
    { ok: true, overrides: { planningSeconds: 15, worldSeconds: 150, startingEnergy: 1000 } });
});

test("values the server would refuse are explained in words instead of sent", () => {
  const out = overridesOf({ planningSeconds: "2", worldMinutes: "200", startingEnergy: "-5" }, beginner);
  assert.equal(out.ok, false);
  const errors = (out as { errors: Record<string, string> }).errors;
  assert.match(errors.planningSeconds!, /5 to 900/);
  assert.match(errors.worldMinutes!, /half a minute to 120 minutes/);
  assert.match(errors.startingEnergy!, /0 or more/);
  assert.equal(overridesOf({ planningSeconds: "ten", worldMinutes: "5", startingEnergy: "1" }, beginner).ok, false);
  assert.equal(overridesOf({ planningSeconds: "7.5", worldMinutes: "5", startingEnergy: "1" }, beginner).ok, false, "whole seconds only");
});

test("the next game's summary uses the overrides", () => {
  assert.equal(nextGameSummary(beginner, { worldSeconds: 120 }), `3 or more players · 60 s to plan · 2 min game · ${beginner.startingEnergy} ⚡ to start.`);
  assert.match(nextGameSummary(presetOf("lines-beginner-bidding"), {}), /45 s of bidding first/);
});
