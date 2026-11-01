/**
 * The forge's language choice (src/core/game/language.ts). What would break: the dropdown offering a language the room
 * does not allow, an agent being edited in a different language than it was written in, or a draft from an earlier
 * game keeping a language this game no longer allows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { forgeLanguage, forgeLanguages } from "../src/core/game/language.ts";

test("the dropdown lists exactly the room's allowed languages, in the room's order", () => {
  assert.deepEqual(forgeLanguages({ languages: ["typescript", "python"], language: "typescript" }), ["typescript", "python"]);
  assert.deepEqual(forgeLanguages({ languages: ["python"], language: "python" }), ["python"]);
  assert.deepEqual(forgeLanguages({ language: "typescript" }), ["typescript"], "an observation from before the set: its one language");
  assert.deepEqual(forgeLanguages(undefined), [], "nothing to offer before the observation arrives");
});

test("the default is the agent's own language when allowed, otherwise the first allowed one", () => {
  const both = ["python", "typescript"] as const;
  assert.equal(forgeLanguage(both, "typescript"), "typescript", "the agent's existing language");
  assert.equal(forgeLanguage(both, null, undefined), "python", "nothing chosen: the first allowed");
  assert.equal(forgeLanguage(["typescript"], "python"), "typescript", "a language this game does not allow is not kept");
  assert.equal(forgeLanguage(["typescript"], null, "python", "typescript"), "typescript", "the first preference the game allows");
  assert.equal(forgeLanguage([], "python"), "python", "no observation yet: the preference stands");
  assert.equal(forgeLanguage([], null), "python");
});
