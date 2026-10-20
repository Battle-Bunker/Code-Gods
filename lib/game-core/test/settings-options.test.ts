import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, validateSettings } from "../src/settings.ts";

test("every authored option is accepted with its compatible language and type", () => {
  for (const language of ["python", "typescript"] as const) {
    for (const objectType of ["Int", "string"] as const) {
      const settings = { ...DEFAULT_SETTINGS, language, objectType };
      for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
        settings[key] = SETTINGS_OPTIONS[key].find(o => o.languages.includes(language) && o.objectTypes.includes(objectType))!.id;
      }
      assert.doesNotThrow(() => validateSettings(settings));
    }
  }
});
test("unknown identifiers and cross-language grammars are rejected", () => {
  for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, [key]: "custom-arbitrary-id" }), /Unsupported/);
  }
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, language: "typescript" }), /Unsupported grammarId/);
});
