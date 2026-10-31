/** Pure rules of a room's settings origin (convex/lib/settingsOrigin.ts): which preset the settings are on, and whether they still match it. */
import test from "node:test";
import assert from "node:assert/strict";
import { presetSettings } from "@workspace/game-core";
import { nextSettingsOrigin, presetOrigin, stableJson } from "../../convex/lib/settingsOrigin.ts";

test("a preset argument makes an unmodified preset origin; explicit settings mark the preset modified only when they differ", () => {
  const classic = presetSettings("grid-classic", "python");
  assert.deepEqual(nextSettingsOrigin(presetOrigin("grid-first-steps"), { preset: "grid-classic" }, classic), { kind: "preset", id: "grid-classic", modified: false });
  // The same settings sent explicitly, in another key order: still the unmodified preset.
  const reordered = Object.fromEntries(Object.entries(classic).reverse()) as typeof classic;
  assert.deepEqual(nextSettingsOrigin(presetOrigin("grid-classic"), { settings: { interactionRateHz: classic.interactionRateHz } }, reordered), { kind: "preset", id: "grid-classic", modified: false });
  assert.deepEqual(nextSettingsOrigin(presetOrigin("grid-classic"), { settings: { interactionRateHz: 7 } }, { ...classic, interactionRateHz: 7 }), { kind: "preset", id: "grid-classic", modified: true });
  // The preset's language follows the settings: a TypeScript Classic is still Classic.
  const ts = presetSettings("grid-classic", "typescript");
  assert.deepEqual(nextSettingsOrigin(presetOrigin("grid-classic"), { settings: { language: "typescript" } }, ts), { kind: "preset", id: "grid-classic", modified: false });
});

test("without a usable origin the settings are custom", () => {
  const classic = presetSettings("grid-classic", "python");
  assert.deepEqual(nextSettingsOrigin(undefined, { settings: {} }, classic), { kind: "custom", modified: false });
  assert.deepEqual(nextSettingsOrigin({ kind: "custom", modified: false }, { settings: {} }, classic), { kind: "custom", modified: false });
  assert.deepEqual(nextSettingsOrigin(presetOrigin("gone-preset"), { settings: {} }, classic), { kind: "custom", modified: false }, "a preset no longer shipped");
  assert.equal(stableJson({ b: [1, { d: 2, c: 3 }], a: "x" }), '{"a":"x","b":[1,{"c":3,"d":2}]}');
});
