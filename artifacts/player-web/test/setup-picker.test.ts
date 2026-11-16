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
  assert.deepEqual(player.map(g => g.label), ["System setups"]);
  assert.ok(!player[0]!.presets.some(isLab));
  const admin = setupGroups(presets, { admin: true, current: beginner.id });
  assert.deepEqual(admin.map(g => g.label), ["System setups", "Lab (admins only)"]);
  assert.deepEqual(admin[1]!.presets.map(p => p.id), [lab.id]);
});

test("a room already on a Lab preset still shows it to a player, so the picker never hides what the room plays", () => {
  const g = setupGroups(presets, { admin: false, current: lab.id });
  assert.deepEqual(g.map(x => x.label), ["System setups", "Lab (admins only)"]);
  assert.deepEqual(g[1]!.presets.map(p => p.id), [lab.id]);
});

test("each setup says in words what it plays", () => {
  assert.match(setupBlurb(beginner), /fraction/i);
  assert.ok(!PRESETS.some(p => p.variant === "line-z"), "whole-number lines are not offered");
  assert.match(setupBlurb(presetOf("lines-beginner-bidding")), /bid/i);
  assert.match(setupBlurb(presetOf("grids-original-colours")), /^A 4 × 4 grid of digits in red, green and blue, 18 kinds of rule\.$/);
  for (const p of PRESETS.filter(x => x.variant.startsWith("board-"))) assert.ok(!setupBlurb(p).startsWith("A board of its own"), `${p.id} says what board it plays`);
});

test("the form starts from the overrides, else the preset's own values, with the game length in minutes", () => {
  const rest = { durationMode: "fixed", scoreIntervalSeconds: "10", peerNoiseVariance: "0", readPriceWeight: String(beginner.readPriceWeight), driftSeconds: String(beginner.driftSeconds) };
  assert.deepEqual(formOf(beginner, {}), { planningSeconds: "60", worldMinutes: "10", startingEnergy: String(beginner.startingEnergy), ...rest });
  assert.deepEqual(formOf(beginner, { worldSeconds: 90, planningSeconds: 20 }), { planningSeconds: "20", worldMinutes: "1.5", startingEnergy: String(beginner.startingEnergy), ...rest });
});

test("only the values that differ from the preset are sent, minutes as seconds", () => {
  assert.deepEqual(overridesOf({ ...formOf(beginner, {}) }, beginner), { ok: true, overrides: {} });
  assert.deepEqual(overridesOf({ ...formOf(beginner, {}), planningSeconds: "15", worldMinutes: "2.5", startingEnergy: "1000" }, beginner),
    { ok: true, overrides: { planningSeconds: 15, worldSeconds: 150, startingEnergy: 1000 } });
});

test("values the server would refuse are explained in words instead of sent", () => {
  const out = overridesOf({ ...formOf(beginner, {}), planningSeconds: "2", worldMinutes: "200", startingEnergy: "-5" }, beginner);
  assert.equal(out.ok, false);
  const errors = (out as { errors: Record<string, string> }).errors;
  assert.match(errors.planningSeconds!, /5 to 900/);
  assert.match(errors.worldMinutes!, /half a minute to 120 minutes/);
  assert.match(errors.startingEnergy!, /0 or more/);
  assert.equal(overridesOf({ ...formOf(beginner, {}), planningSeconds: "ten", startingEnergy: "1" }, beginner).ok, false);
  assert.equal(overridesOf({ ...formOf(beginner, {}), planningSeconds: "7.5", startingEnergy: "1" }, beginner).ok, false, "whole seconds only");
});

test("the next game's summary uses the overrides", () => {
  assert.equal(nextGameSummary(beginner, { worldSeconds: 120 }), `3 or more players · 60 s to plan · 2 min game · ${beginner.startingEnergy} energy to start · others' sums exact · totals every 10 s · a look costs ${beginner.readPriceWeight.toFixed(2)}× the read price · the rules' numbers may change every 2 min.`);
  assert.match(nextGameSummary(presetOf("lines-beginner-bidding"), {}), /45 s of bidding first/);
});

test("how the game ends, how often totals are counted and the noise on the others' sums are settings too (v1's)", () => {
  const f = formOf(beginner, {});
  assert.deepEqual([f.durationMode, f.scoreIntervalSeconds, f.peerNoiseVariance], ["fixed", "10", "0"], "the preset's mode and noise (0 on the beginner game: decision 32); v1's interval");
  assert.deepEqual(overridesOf({ ...f, durationMode: "halfLife", scoreIntervalSeconds: "30", peerNoiseVariance: "64" }, beginner),
    { ok: true, overrides: { durationMode: "halfLife", scoreIntervalSeconds: 30, peerNoiseVariance: 64 } });
  assert.match(nextGameSummary(beginner, { peerNoiseVariance: 64 }), /others' sums blurred \(about ±8 bits each reading\)/);
  assert.deepEqual(overridesOf(f, beginner), { ok: true, overrides: {} }, "defaults are not sent");
  const bad = overridesOf({ ...f, scoreIntervalSeconds: "0" }, beginner);
  assert.match((bad as { errors: Record<string, string> }).errors.scoreIntervalSeconds!, /1 to 3,600 whole seconds/);
  assert.equal(overridesOf({ ...f, peerNoiseVariance: "8" }, beginner).ok, false, "only 0, 4, 16, 64 or 256 bits²");
});

test("a half-life game's summary says its end is hidden, with the half-life", () => {
  assert.match(nextGameSummary(beginner, { durationMode: "halfLife" }), /ends at a hidden moment, half of games within 10 min/);
  assert.doesNotMatch(nextGameSummary(beginner, { durationMode: "halfLife" }), /10 min game/);
  assert.match(nextGameSummary(beginner, { peerNoiseVariance: 0, scoreIntervalSeconds: 30 }), /others' sums exact · totals every 30 s/);
});

test("the noise defaults to the preset's own (decision 32: 0 on the beginner game, σ 8 elsewhere)", () => {
  const lenses = presetOf("lines-lenses");
  assert.equal(formOf(lenses, {}).peerNoiseVariance, "64");
  assert.deepEqual(overridesOf(formOf(lenses, {}), lenses), { ok: true, overrides: {} }, "the preset's own is not sent");
});

test("every game pays to look (owner decision 35); the room sets the price's weight, 0 to 4 in quarters, or keeps the preset's own", () => {
  const f = formOf(beginner, {});
  // The preset's weight is derived from its power (W3 #695), not a quarter: it is kept as it is, and never sent.
  assert.equal(Number(f.readPriceWeight), beginner.readPriceWeight);
  assert.deepEqual(overridesOf(f, beginner), { ok: true, overrides: {} }, "the preset's own is valid and not sent");
  assert.deepEqual(overridesOf({ ...f, readPriceWeight: "0" }, beginner), { ok: true, overrides: { readPriceWeight: 0 } });
  assert.deepEqual(overridesOf({ ...f, readPriceWeight: "1.5" }, beginner), { ok: true, overrides: { readPriceWeight: 1.5 } });
  assert.equal(overridesOf({ ...f, readPriceWeight: "0.3" }, beginner).ok, false, "any other value in quarters only");
  assert.equal(overridesOf({ ...f, readPriceWeight: "5" }, beginner).ok, false, "at most 4");
  assert.match(nextGameSummary(beginner, {}), new RegExp(`a look costs ${beginner.readPriceWeight.toFixed(2)}× the read price`));
  assert.match(nextGameSummary(beginner, { readPriceWeight: 0 }), /looking is free/);
  assert.doesNotMatch(JSON.stringify(f), /observation/, "no free/paid choice any more");
});

test("a trial setup on a variant of a board is described by that board, never its internal name (round 11: 'line-q-lenses')", () => {
  const lenses = PRESETS.find(p => p.variant === "line-q-lenses");
  assert.ok(lenses, "the lenses trial is deployed");
  assert.match(setupBlurb(lenses!), /^Fraction lines, /);
  for (const p of PRESETS) assert.doesNotMatch(setupBlurb(p), /\b[a-z]+-[a-z0-9]+(-[a-z0-9]+)*\b/, `${p.id}: ${setupBlurb(p)}`);
});

test("how often the rules' numbers change is a room setting (call 18): the preset's own by default, 0 for never", () => {
  const f = formOf(beginner, {});
  assert.equal(f.driftSeconds, String(beginner.driftSeconds));
  assert.deepEqual(overridesOf(f, beginner), { ok: true, overrides: {} });
  assert.deepEqual(overridesOf({ ...f, driftSeconds: "0" }, beginner), { ok: true, overrides: { driftSeconds: 0 } });
  assert.equal(overridesOf({ ...f, driftSeconds: "4000" }, beginner).ok, false);
  assert.equal(overridesOf({ ...f, driftSeconds: "1.5" }, beginner).ok, false, "whole seconds");
  assert.match(nextGameSummary(beginner, {}), /rules' numbers may change every 2 min/);
  assert.doesNotMatch(nextGameSummary(beginner, { driftSeconds: 0 }), /numbers change/);
});

test("the combobox's system rows: every setup matching the search by title or blurb, the Lab last and only for admins", async () => {
  const { presetRows } = await import("../src/site/lib/setup-picker.ts");
  const all = presetRows(presets, { admin: false, current: beginner.id, query: "" });
  assert.ok(all.length > 0 && all.every(r => !r.lab), "a player sees no Lab setup");
  assert.deepEqual(presetRows(presets, { admin: false, current: beginner.id, query: "BIDDING" }).map(r => r.preset.id).filter(id => id.startsWith("lines")), ["lines-beginner-bidding"]);
  const grids = presetRows(presets, { admin: false, current: beginner.id, query: "grid of digits" });
  assert.ok(grids.length > 0 && grids.every(r => /grid of digits/.test(setupBlurb(r.preset))), "the blurb is searched");
  const admin = presetRows(presets, { admin: true, current: beginner.id, query: "" });
  assert.equal(admin.at(-1)!.lab, true, "the Lab comes last");
  assert.equal(presetRows(presets, { admin: false, current: lab.id, query: "" }).some(r => r.preset.id === lab.id), true, "the room's own setup always shows");
});
