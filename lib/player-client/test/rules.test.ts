/** The rules text the assistant reads (get_rules): it explains every setting with the configuration page's own words. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, SETTINGS_DOCS } from "@workspace/game-core";
import { rulesText, settingsExplained } from "../src/rules.ts";

test("rules text explains every documented setting with its value, meaning and consequence", () => {
  const text = rulesText(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  for (const [key, doc] of Object.entries(SETTINGS_DOCS)) {
    assert.ok(text.includes(`- ${key} = `), `${key} is listed with its value`);
    assert.ok(text.includes(doc.meaning), `${key}: its meaning is the configuration page's`);
    assert.ok(text.includes(doc.consequence), `${key}: its consequence is the configuration page's`);
  }
  assert.ok(text.includes(`- halfLifeSeconds = ${DEFAULT_SETTINGS.halfLifeSeconds} s:`), "units follow the value");
});

test("settings explained: lists and missing values read as words, never as [object Object]", () => {
  const lines = settingsExplained({ excludedFamilies: [], typeArgs: { size: 4 } });
  assert.ok(lines.includes("- excludedFamilies = none:"));
  assert.ok(lines.includes('- typeArgs = {"size":4}:'));
  assert.ok(lines.includes("- language = ?:"));
  assert.equal(lines.includes("[object Object]"), false);
});
