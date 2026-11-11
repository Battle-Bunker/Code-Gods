/**
 * The forge's first-agent pre-fill (src/core/panels/first-agent.ts). What would break: a new player facing an empty
 * editor, an example that overwrites what the player typed, an example that comes back after the player cleared it,
 * a stale Python example left in the editor after switching to TypeScript, or the editor of a player who already has
 * agents changing by itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_AGENT_HINT, STARTER_AGENT_HINT, armedStep, armedText, energyHint, firstAgentFill, firstAgentHint, untouchedExample, lacksEnergy, readyText, summonReady, summonedText, type ArmedSummon, type Examples, type FirstAgentState,
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

test("Summon is ready at once for the untouched example; the player's own code is validated first and must be payable", () => {
  assert.equal(summonReady({ untouched: true, valid: false, price: undefined, energy: 200 }), true, "no validation needed: the summon examines it");
  assert.equal(summonReady({ untouched: false, valid: false, price: undefined, energy: 200 }), false, "own code: validate first");
  assert.equal(summonReady({ untouched: false, valid: true, price: 150, energy: 200 }), true);
  assert.equal(summonReady({ untouched: true, valid: true, price: 365, energy: 200 }), false, "a known price above the energy: armed instead");
  assert.equal(summonReady({ untouched: true, valid: false, price: 0, energy: 200 }), false, "validated and found invalid");
});

test("a summon refused for lack of energy is recognised from the engine's message", () => {
  assert.ok(lacksEnergy("Insufficient energy"));
  assert.ok(!lacksEnergy("You already have 8 agents"));
  assert.ok(!lacksEnergy(undefined));
});

test("after a summon the next step is said; My agents in planning says the agent is ready", () => {
  assert.equal(summonedText("Mirror maker", true), "Summoned: Mirror maker is in the game. It acts when the world starts. Watch 'My agents' for what it does. Then try the change suggested in the code and summon again.");
  assert.match(summonedText("Mirror maker", false), /It acts whenever it gets a turn\./);
  assert.equal(readyText([]), null);
  assert.equal(readyText(["Mirror maker"]), "Mirror maker is ready. It acts when the world starts.");
  assert.equal(readyText(["Mirror maker", "B"]), "Mirror maker and 1 more agent are ready. They act when the world starts.");
  assert.equal(readyText([undefined]), "Your agent is ready. It acts when the world starts.");
});

test("an agent the player cannot pay for yet: the hint gives both numbers and says when it will be payable", () => {
  assert.equal(energyHint({ cost: 150, energy: 200, income: 64, planning: true }), null, "payable: nothing to say");
  assert.equal(energyHint({ cost: 200, energy: 200, planning: true }), null);
  assert.equal(energyHint({ cost: 364.6, energy: 200, income: 64, planning: true }),
    "This agent costs 365 energy and you have 200. You will have enough about 3 s after the world starts.");
  assert.equal(energyHint({ cost: 364.6, energy: 200.9, income: 8, planning: false }),
    "This agent costs 365 energy and you have 200. You will have enough in about 25 s.", "longer waits are rounded up to 5 s");
  assert.equal(energyHint({ cost: 365, energy: 200, planning: true }),
    "This agent costs 365 energy and you have 200. You earn more once the world starts.", "income unknown: no time");
  assert.equal(energyHint({ cost: 365, energy: 200, planning: false }), "This agent costs 365 energy and you have 200. You earn more as the world runs.");
  assert.equal(energyHint({ cost: 365, energy: 200, income: 0, planning: false }),
    "This agent costs 365 energy and you have 200. All your power goes to your agents, so your own energy is not growing. Lower an agent's share in My agents, then come back.");
});

test("an armed summon waits for the energy, fires once it is there, and is dropped by an edit", () => {
  const armed: ArmedSummon = { name: "Three apart", language: "python", source: "def agent(grid):\n    return []\n", cost: 365 };
  const now = { source: armed.source, language: "python", energy: 200, busy: false, canSummon: true };
  assert.equal(armedStep(null, now), "idle");
  assert.equal(armedStep(armed, now), "wait", "not enough energy yet");
  assert.equal(armedStep(armed, { ...now, energy: undefined }), "wait", "energy not known");
  assert.equal(armedStep(armed, { ...now, energy: 364.9 }), "wait");
  assert.equal(armedStep(armed, { ...now, energy: 365 }), "fire");
  assert.equal(armedStep(armed, { ...now, energy: 900, busy: true }), "wait", "one command at a time");
  assert.equal(armedStep(armed, { ...now, energy: 900, canSummon: false }), "wait", "sandbox warming or game paused: not now");
  assert.equal(armedStep(armed, { ...now, energy: 900, source: armed.source + "#" }), "disarm", "an edit is a different agent");
  assert.equal(armedStep(armed, { ...now, language: "typescript" }), "disarm");
  // The caller clears the armed summon before sending, so the next step cannot fire again.
  assert.equal(armedStep(null, { ...now, energy: 900 }), "idle", "never twice");
  assert.equal(armedText(armed, { energy: 200, income: 64, planning: true }),
    "Armed: Three apart will be summoned about 3 s after the world starts. Keep this pane open.");
  assert.equal(armedText(armed, { energy: 200, income: 8, planning: false }), "Armed: Three apart will be summoned in about 25 s. Keep this pane open.");
  assert.equal(armedText(armed, { energy: 200, planning: true }), "Armed: Three apart will be summoned as soon as you have the energy. Keep this pane open.");
});

test("an armed summon is dropped when the game has ended or gameplay is off", () => {
  const armed: ArmedSummon = { name: "A", language: "python", source: "x", cost: 300 };
  assert.equal(armedStep(armed, { source: "x", language: "python", energy: 400, busy: false, canSummon: false, over: true }), "disarm");
  assert.equal(armedStep(armed, { source: "x", language: "python", energy: 400, busy: false, canSummon: false }), "wait", "a warming sandbox only waits");
});
