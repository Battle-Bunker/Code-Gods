/** Paid observation's pure rules (convex/lib/knowledge.ts; docs/energy-model.md §11). */
import test from "node:test";
import assert from "node:assert/strict";
import { SEED_SETUPS, DEFAULT_SETUP_SEED_ID, DEFAULT_SETTINGS, paidObservation, upgradeStoredSettings, validateSettings } from "@workspace/game-core";
import { lookPriceOf, paidLive, readWhole, toldEvent } from "../../convex/lib/knowledge.ts";

test("the setting: absent is free, the default setup is paid, an ended game is open", () => {
  assert.equal(DEFAULT_SETTINGS.observation, "free");
  assert.equal(paidObservation({}), false, "settings stored before the setting are free");
  assert.equal((upgradeStoredSettings({ languages: ["python"] }) as { observation: string }).observation, "free");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, observation: "cheap" as never }), /observation/);
  const beginner = SEED_SETUPS.find(s => s.seedId === DEFAULT_SETUP_SEED_ID)!.settings;
  assert.equal(beginner.observation, "paid");
  assert.equal(paidLive({ settings: beginner, phase: "running" }), true);
  assert.equal(paidLive({ settings: beginner, phase: "planning" }), true);
  assert.equal(paidLive({ settings: beginner, phase: "ended" }), false);
  assert.equal(paidLive({ settings: { ...beginner, observation: "free" }, phase: "running" }), false);
});

test("a look costs the object's full read at the read price: less than the cheapest change on every seed setup", () => {
  const price = Object.fromEntries(SEED_SETUPS.map(s => [s.name, Math.round(lookPriceOf(s.settings) * 100) / 100]));
  assert.deepEqual(price, { "First steps": 2.45, "Annotated basics": 1.66, "Annotated colours": 2.45, Classic: 4.16, "Low income": 4.16, "Big board": 7.41, Master: 12.69 });
});

test("an act tells its god the object only when it read all of it", () => {
  assert.equal(readWhole(53.15, 53.15084951), false);
  assert.equal(readWhole(53.15084951, 53.15084951), true);
  assert.equal(readWhole(0, 0), false, "an object with nothing to read is not told by an act that read nothing");
});

test("a god of a paid live game is told births, phases and its own agents' events", () => {
  const me = "me";
  assert.ok(toldEvent({ t: "spawn" }, me) && toldEvent({ t: "rescore" }, me) && toldEvent({ t: "phase" }, me));
  for (const t of ["transform", "fail", "skip", "summon", "destroy", "power", "look"]) {
    assert.equal(toldEvent({ t, ownerId: me }, me), true, t);
    assert.equal(toldEvent({ t, ownerId: "other" }, me), false, t);
  }
});
