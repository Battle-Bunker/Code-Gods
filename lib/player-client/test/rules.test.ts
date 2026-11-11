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

test("breaking costs extra is explained with the act cost only in a room that charges for it", () => {
  const off = rulesText(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  assert.equal(/Breaking costs extra/.test(off), false, "off by default: the act cost reads as before");
  assert.ok(off.includes("- breakCost = 0:"), "the setting itself is still listed");
  const on = rulesText({ ...DEFAULT_SETTINGS, breakCost: 2 } as unknown as Record<string, unknown>);
  assert.ok(on.includes("Breaking costs extra in this room: when your change makes an object worth fewer bits to all the gods together, you pay for every bit you destroyed."), on);
  assert.ok(on.includes("W + 2 × the bits destroyed"), "the formula with this room's value");
  const old = rulesText((({ breakCost: _, ...rest }) => rest)(DEFAULT_SETTINGS) as unknown as Record<string, unknown>);
  assert.equal(/Breaking costs extra/.test(old), false, "a game from before the setting: off");
});

test("the rules name every allowed language and each one's agent shape; an old single language still reads", () => {
  const both = rulesText({ ...DEFAULT_SETTINGS, languages: ["typescript", "python"] } as unknown as Record<string, unknown>);
  assert.match(both, /one of this game's languages \(TypeScript, Python\), chosen per agent/);
  assert.ok(both.includes("`function agent(obj)` (TypeScript) or `def agent(obj)` (Python)"), both);
  assert.ok(both.includes("- languages = typescript, python:"));
  const { languages: _l, ...rest } = DEFAULT_SETTINGS;
  assert.match(rulesText({ ...rest, language: "typescript" }), /languages \(TypeScript\)/);
});

test("settings explained: lists and missing values read as words, never as [object Object]", () => {
  const lines = settingsExplained({ excludedFamilies: [], typeArgs: { size: 4 } });
  assert.ok(lines.includes("- excludedFamilies = none:"));
  assert.ok(lines.includes('- typeArgs = {"size":4}:'));
  assert.ok(lines.includes("- languages = ?:"));
  assert.equal(lines.includes("[object Object]"), false);
});
