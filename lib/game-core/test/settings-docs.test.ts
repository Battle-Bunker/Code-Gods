/**
 * SETTINGS_DOCS (docs/research/ui-redesign/onboarding-and-config.md §4.6): every GameSettings field is documented
 * (the `satisfies` makes a missing field a type error; this test checks the texts), each meaning and consequence is
 * one plain sentence the assistant can read too, and the stepped choices contain every tuned value a seed setup or the
 * type defaults use, so the configuration page can always show the current value as a choice.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { OBJECT_TYPES } from "@workspace/game-types";
import {
  DEFAULT_SETTINGS, ROOM_BUDGET_DOCS, SEED_SETUPS, SETTINGS_DOCS, TYPE_DEFAULTS, type FieldDoc, type GameSettings,
} from "../src/settings.ts";

const LAYOUT_WORDS = /\b(below|above|click|button|tab|panel|page|screen)\b/i;
const paramDocs = OBJECT_TYPES.flatMap(t => t.params.map((p): [string, Pick<FieldDoc, "question" | "meaning" | "consequence">] => [`${t.id}.${p.id}`, p]));
const docs = [...Object.entries({ ...SETTINGS_DOCS, ...ROOM_BUDGET_DOCS }), ...paramDocs] as [string, FieldDoc][];

test("every settings field, type argument and room budget has a question, a meaning and a consequence", () => {
  assert.ok(paramDocs.length >= 6, "Grid size/symbols/colours, Int min/max and string maxLength are documented");
  assert.deepEqual(Object.keys(SETTINGS_DOCS).sort(), Object.keys(DEFAULT_SETTINGS).sort(), "one doc per GameSettings field, no stale keys");
  assert.deepEqual(Object.keys(ROOM_BUDGET_DOCS).sort(), ["aiBudget", "assistantBudget", "assistantModel"]);
  for (const [key, doc] of docs) {
    assert.match(doc.question, /^[A-Z].*\?$/, `${key}: the question is a question`);
    for (const part of ["meaning", "consequence"] as const) {
      const text = doc[part];
      assert.ok(text.length <= 200, `${key}.${part} is at most 200 characters (${text.length})`);
      assert.match(text, /^[A-Z].*\.$/, `${key}.${part} is a sentence`);
      assert.equal(text.match(/[.!?](\s|$)/g)?.length, 1, `${key}.${part} is ONE sentence: ${text}`);
      assert.doesNotMatch(text, LAYOUT_WORDS, `${key}.${part} names no layout (the assistant reads it too)`);
    }
  }
});

test("stepped choices include every default, tuned type default and seed setup value", () => {
  const sources: [string, Partial<GameSettings>][] = [
    ["DEFAULT_SETTINGS", DEFAULT_SETTINGS],
    ...Object.entries(TYPE_DEFAULTS).flatMap(([type, d]): [string, Partial<GameSettings>][] => [
      [`${type}.all`, d.all ?? {}], ...Object.entries(d.byKey ?? {}).map(([k, v]): [string, Partial<GameSettings>] => [k, v])]),
    ...SEED_SETUPS.map((s): [string, Partial<GameSettings>] => [s.seedId, s.settings]),
  ];
  for (const [source, values] of sources) {
    for (const [key, value] of Object.entries(values) as [keyof GameSettings, unknown][]) {
      const suggested = SETTINGS_DOCS[key].suggested as readonly unknown[] | undefined;
      if (!suggested || typeof value === "object") continue;
      assert.ok(suggested.includes(value), `${source}: ${key} = ${String(value)} is among the suggested ${suggested.join(", ")}`);
    }
  }
});

test("dependencies point at real fields; penalty weight hides while no defence goals are dealt", () => {
  for (const [key, doc] of docs) {
    for (const dep of [...(doc.dependsOn ?? []), ...Object.keys(doc.hiddenWhen ?? {})]) {
      assert.ok(dep in SETTINGS_DOCS, `${key} depends on ${dep}, a settings field`);
    }
  }
  assert.deepEqual(SETTINGS_DOCS.penaltyWeight.hiddenWhen, { defenceGoals: false });
  assert.deepEqual(SETTINGS_DOCS.excludedDefenceFamilies.hiddenWhen, { defenceGoals: false }, "the checklist belongs to the switch");
  assert.equal(SETTINGS_DOCS.languages.control, "multiselect", "a game allows a set of languages");
  assert.deepEqual(SETTINGS_DOCS.languages.suggested, ["python", "typescript"], "pre-authored: the supported languages, no free text");
});

test("every field is a control: asked or under More, never a fixed fact, with a control that fits its value", () => {
  const kinds: Record<string, (v: unknown) => boolean> = {
    number: v => typeof v === "number", switch: v => typeof v === "boolean", checklist: Array.isArray,
    select: v => typeof v === "string", multiselect: v => Array.isArray(v) && v.length > 0, segmented: v => typeof v === "string", typeArgs: v => !!v && typeof v === "object" && !Array.isArray(v),
  };
  for (const [key, doc] of Object.entries(SETTINGS_DOCS) as [keyof GameSettings, FieldDoc][]) {
    assert.ok(doc.tier === "ask" || doc.tier === "more", `${key}: tier ${doc.tier}`);
    assert.ok(doc.control in kinds, `${key}: a known control kind (${doc.control})`);
    assert.ok(kinds[doc.control]!(DEFAULT_SETTINGS[key]), `${key}: a ${doc.control} control fits its value`);
  }
  for (const key of ["languages", "utilitySelectorId", "priorId", "spawnFunctionId", "objectSelection", "commitClause"] as const) {
    assert.notEqual(SETTINGS_DOCS[key].control, undefined, `${key} is edited, not asserted`);
  }
});
