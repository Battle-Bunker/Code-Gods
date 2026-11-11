/**
 * The forge's first-agent pre-fill (src/core/panels/first-agent.ts). What would break: a new player facing an empty
 * editor, an example that overwrites what the player typed, an example that comes back after the player cleared it,
 * a stale Python example left in the editor after switching to TypeScript, or the editor of a player who already has
 * agents changing by itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_AGENT_HINT, STARTER_AGENT_HINT, firstAgentFill, firstAgentHint, untouchedExample, validatesExample, type Examples, type FirstAgentState,
} from "../src/core/panels/first-agent.ts";

const py = { name: "Mirror maker", source: "# My goal: mirrors\ndef agent(grid):\n    return []\n", specific: true };
const ts = { name: "Mirror maker", source: "// My goal: mirrors\nfunction agent(grid) {\n  return [];\n}\n", specific: true };
const examples: Examples = { python: py, typescript: ts };
const state = (over: Partial<FirstAgentState>): FirstAgentState =>
  ({ editable: true, agents: 0, source: "", language: "python", examples, offered: false, ...over });

test("a player with no agents and an empty editor gets the example for their goal in the selected language", () => {
  assert.deepEqual(firstAgentFill(state({})), py);
  assert.deepEqual(firstAgentFill(state({ language: "typescript" })), ts);
  assert.deepEqual(firstAgentFill(state({ source: "  \n" })), py, "blank is empty");
});

test("nothing is filled for a player who has agents, while that is unknown, when read-only, or with no example to offer", () => {
  assert.equal(firstAgentFill(state({ agents: 1 })), null, "the forge stays as it was for players with agents");
  assert.equal(firstAgentFill(state({ agents: undefined })), null, "not before the agents are known");
  assert.equal(firstAgentFill(state({ editable: false })), null);
  assert.equal(firstAgentFill(state({ examples: {} })), null, "no goal card yet");
  assert.equal(firstAgentFill(state({ language: "typescript", examples: { python: py } })), null, "no example in this language");
});

test("an edited draft is never overwritten", () => {
  const edited = py.source.replace("return []", "return [write(grid.cell(0, 0), 5)]");
  assert.equal(firstAgentFill(state({ source: edited, offered: true })), null);
  assert.equal(firstAgentFill(state({ source: edited, language: "typescript", offered: true })), null, "not on a language switch either");
  assert.equal(firstAgentFill(state({ source: "def agent(grid):\n    return []" })), null, "the player's own code, example never offered");
});

test("a player who clears the example keeps an empty editor", () => {
  assert.equal(firstAgentFill(state({ source: "", offered: true })), null);
});

test("switching the language swaps the untouched example, and only then", () => {
  assert.deepEqual(firstAgentFill(state({ source: py.source, language: "typescript", offered: true })), ts);
  assert.deepEqual(firstAgentFill(state({ source: ts.source, language: "python", offered: true })), py);
  assert.equal(firstAgentFill(state({ source: py.source, language: "python", offered: true })), null, "already there");
  assert.equal(untouchedExample(py.source, examples), "python");
  assert.equal(untouchedExample(py.source + " ", examples), null);
});

test("the hint shows only above the untouched example, and says so honestly for the starter fallback", () => {
  assert.equal(firstAgentHint(py.source, "python", examples), FIRST_AGENT_HINT);
  assert.equal(FIRST_AGENT_HINT, "This agent already works for your goal. Summon it, then try changing it.");
  assert.equal(firstAgentHint(py.source + "#", "python", examples), null, "gone once the player edits");
  assert.equal(firstAgentHint(py.source, "typescript", examples), null);
  const starter = { name: "First agent", source: "def agent(grid):\n    return []\n", specific: false };
  assert.equal(firstAgentHint(starter.source, "python", { python: starter }), STARTER_AGENT_HINT);
});

test("the untouched example validates by itself once, when validation can run", () => {
  const ok = { untouched: true, validated: false, busy: false, ready: true, tried: false };
  assert.equal(validatesExample(ok), true);
  assert.equal(validatesExample({ ...ok, untouched: false }), false, "the player's own code waits for their click");
  assert.equal(validatesExample({ ...ok, validated: true }), false);
  assert.equal(validatesExample({ ...ok, busy: true }), false);
  assert.equal(validatesExample({ ...ok, ready: false }), false, "sandbox warming, game ended, read-only");
  assert.equal(validatesExample({ ...ok, tried: true }), false, "never in a loop");
});
