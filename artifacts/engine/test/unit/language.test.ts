/**
 * Which language a stored agent runs in (convex/lib/language.ts). What would break: an agent summoned in a
 * multi-language game run by another language's sandbox, or an agent stored before agents carried a language (in a
 * game still holding one `language`) failing to run at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type GameSettings } from "@workspace/game-core";
import { agentLanguage } from "../../convex/lib/language.ts";

const both: GameSettings = { ...DEFAULT_SETTINGS, languages: ["python", "typescript"] };

test("an agent runs in its own language, whatever the game's default", () => {
  assert.equal(agentLanguage({ language: "typescript" }, both), "typescript");
  assert.equal(agentLanguage({ language: "python" }, { ...both, languages: ["typescript", "python"] }), "python");
});

test("an agent stored without a language runs in its game's one language, old settings shape or new", () => {
  assert.equal(agentLanguage({}, { ...DEFAULT_SETTINGS, languages: ["typescript"] }), "typescript");
  const { languages: _l, ...rest } = DEFAULT_SETTINGS;
  assert.equal(agentLanguage({}, { ...rest, language: "typescript", grammarId: "typescript-agent-v1" } as never), "typescript");
});
