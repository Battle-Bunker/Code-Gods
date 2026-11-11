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

test("the bid phase is described only when the game has one, with its length and what a winner pays", () => {
  const rules = (patch: object) => rulesText({ ...DEFAULT_SETTINGS, ...patch } as unknown as Record<string, unknown>);
  assert.doesNotMatch(rules({ bidSeconds: 0 }), /## Bidding/);
  const { bidSeconds: _s, bidPricing: _p, ...before } = DEFAULT_SETTINGS;
  assert.doesNotMatch(rulesText(before), /## Bidding/, "a game from before the bid phase had none");
  const first = rules({ bidSeconds: 30, bidPricing: "first" });
  assert.match(first, /## Bidding\nBefore the rules are dealt, the gods have 30 s to bid/);
  assert.match(first, /whole percent from 1 to 100/);
  assert.match(first, /First price: a winner's handicap is their own bid\./);
  assert.doesNotMatch(first, /Second price/);
  const second = rules({ bidSeconds: 45, bidPricing: "second" });
  assert.match(second, /have 45 s to bid/);
  assert.match(second, /Second price: a winner's handicap is the highest bid they beat on that family, at least 1%\./);
  assert.ok(second.indexOf("## Bidding") < second.indexOf("## Agents"), "bidding comes before the agents: it happens first");
});
