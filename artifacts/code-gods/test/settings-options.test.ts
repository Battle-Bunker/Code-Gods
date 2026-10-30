import test from "node:test";
import assert from "node:assert/strict";
import { fixOptionChoices, type OptionCatalog } from "../src/lib/settings-options.ts";

// A two-language catalogue, hand-written: each field has one Python and one TypeScript choice.
const options: OptionCatalog = {
  grammarId: [{ id: "py-g", languages: ["python"], objectTypes: ["Int"] }, { id: "ts-g", languages: ["typescript"], objectTypes: ["Int"] }],
  utilitySelectorId: [{ id: "sel", languages: ["python", "typescript"], objectTypes: ["Int"] }],
  complexityFunctionId: [{ id: "py-c", languages: ["python"], objectTypes: ["Int"] }, { id: "ts-c", languages: ["typescript"], objectTypes: ["Int"] }],
};
const pythonRoom = { grammarId: "py-g", utilitySelectorId: "sel", complexityFunctionId: "py-c" };

test("switching language moves each option to the first choice the new language offers", () => {
  assert.deepEqual(fixOptionChoices({ language: "typescript" }, pythonRoom, options, "typescript", "Int"),
    { language: "typescript", grammarId: "ts-g", complexityFunctionId: "ts-c" });
});

test("before the catalogue loads, a language switch leaves options alone, so they can be repaired once it arrives", () => {
  const early = fixOptionChoices({ language: "typescript" }, pythonRoom, undefined, "typescript", "Int");
  assert.deepEqual(early, { language: "typescript" }, "no blanked fields");
  assert.deepEqual(fixOptionChoices(early, pythonRoom, options, "typescript", "Int"),
    { language: "typescript", grammarId: "ts-g", complexityFunctionId: "ts-c" });
});
