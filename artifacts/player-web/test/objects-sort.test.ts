/**
 * The Objects panel's name and sort choices: the panel is called just "Objects" wherever its title shows (the picker,
 * the palette and the layout summaries read PANELS), and the dropdown (src/core/panels/objects.tsx) offers one option per
 * OBJECT_SORTS entry, each labelled, each accepted as the pane's `sortBy` (the assistant sets the same parameter).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PANELS } from "@workspace/player-client/panels";
import { OBJECT_SORTS, OBJECT_SORT_LABELS } from "@workspace/player-client/objects-page";
import { PANEL_SYNONYMS } from "../src/dock/panel-search.ts";

test("the panel is titled Objects", () => {
  assert.equal(PANELS.objects.title, "Objects");
  assert.ok(PANEL_SYNONYMS.objects.some(w => /payoff/i.test(w)), "a player searching 'payoff' still finds it");
});

test("the dropdown lists payoff, your bits, others' care, most mutated, newest, oldest and recently mutated", () => {
  assert.deepEqual(OBJECT_SORTS.map(s => OBJECT_SORT_LABELS[s]),
    ["Payoff", "Your bits", "Others' care", "Most mutated", "Newest", "Oldest", "Recently mutated"]);
  for (const sort of OBJECT_SORTS) assert.equal(PANELS.objects.params.parse({ sortBy: sort }).sortBy, sort);
  assert.throws(() => PANELS.objects.params.parse({ sortBy: "alphabetical" }));
  assert.equal(PANELS.objects.params.parse({}).sortBy, "payoff", "the default sort is unchanged");
});
