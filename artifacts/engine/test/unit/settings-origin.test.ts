/** Pure rules of a room's settings origin (convex/lib/settingsOrigin.ts): which setup the settings are on, and whether they still match it. */
import test from "node:test";
import assert from "node:assert/strict";
import { seedSetupSettings } from "@workspace/game-core";
import { nextSettingsOrigin, setupOrigin } from "../../convex/lib/settingsOrigin.ts";

test("a setupId makes an unmodified setup origin; explicit settings keep the setup and mark it modified only when they differ", () => {
  const classic = seedSetupSettings("grid-classic");
  assert.deepEqual(nextSettingsOrigin(setupOrigin("first"), { setupId: "classic" }, classic, null), { kind: "setup", id: "classic", modified: false });
  // The same settings saved explicitly, in another key order: still the unmodified setup.
  const reordered = Object.fromEntries(Object.entries(classic).reverse()) as typeof classic;
  assert.deepEqual(nextSettingsOrigin(setupOrigin("classic"), {}, reordered, classic), { kind: "setup", id: "classic", modified: false });
  assert.deepEqual(nextSettingsOrigin(setupOrigin("classic"), {}, { ...classic, interactionRateHz: 7 }, classic), { kind: "setup", id: "classic", modified: true });
  // A language change is a change like any other: the setup's own language is part of it.
  assert.deepEqual(nextSettingsOrigin(setupOrigin("classic"), {}, { ...classic, language: "typescript" }, classic), { kind: "setup", id: "classic", modified: true });
  // Changing back to the setup's settings makes it unmodified again.
  assert.deepEqual(nextSettingsOrigin({ kind: "setup", id: "classic", modified: true }, {}, classic, classic), { kind: "setup", id: "classic", modified: false });
});

test("without a setup the settings are custom", () => {
  const classic = seedSetupSettings("grid-classic");
  assert.deepEqual(nextSettingsOrigin(undefined, {}, classic, null), { kind: "custom", modified: false });
  assert.deepEqual(nextSettingsOrigin({ kind: "custom", modified: false }, {}, classic, null), { kind: "custom", modified: false });
  assert.deepEqual(nextSettingsOrigin(setupOrigin("deleted"), {}, classic, null), { kind: "custom", modified: false }, "a setup that no longer exists");
  assert.deepEqual(nextSettingsOrigin({ kind: "preset", id: "grid-classic", modified: false }, {}, classic, classic), { kind: "custom", modified: false },
    "a legacy preset origin is custom");
});
