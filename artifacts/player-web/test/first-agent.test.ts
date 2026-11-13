/**
 * The forge's first-agent pre-fill (src/core/panels/first-agent.ts). What would break: a new player facing an empty
 * editor, an example that overwrites what the player typed, an example that comes back after the player cleared it,
 * a stale Python example left in the editor after switching to TypeScript, or the editor of a player who already has
 * agents changing by itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_AGENT_HINT, STARTER_AGENT_HINT, armedStep, armedText, energyHint, firstAgentFill, firstAgentHint, untouchedExample, lacksEnergy, readyText, summonReady, summonedText, COPY_HINT, isCopy, replaceNeedsConfirm, firstSummonStep, nextFreeName, proposedName, secondAgentHint, storeAfterSummonText, type ArmedSummon, type Examples, type FirstAgentState,
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
  assert.equal(summonedText("Mirror maker", true), "Summoned: Mirror maker is in the game. It acts when the world starts.");
  assert.ok(!summonedText("Mirror maker", true).includes("Watch"), "My agents is a button beside the line, not a pane the player has to find");
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

test("'Summon my first agent' summons the untouched example at once, and leads an edited draft to the Summon button", () => {
  const base = { requested: true, busy: false, agents: 0 as number | undefined, source: py.source, untouched: true, filling: false, enabled: true };
  assert.equal(firstSummonStep({ ...base, requested: false }), "idle");
  assert.equal(firstSummonStep(base), "summon", "the pre-filled example: one click summons it");
  assert.equal(firstSummonStep({ ...base, busy: true }), "wait", "never beside a command in flight");
  assert.equal(firstSummonStep({ ...base, agents: undefined, source: "", untouched: false }), "wait", "the agent list is still loading: the example may yet arrive");
  assert.equal(firstSummonStep({ ...base, source: "", untouched: false, filling: true }), "wait", "the example is about to be put in the editor");
  assert.equal(firstSummonStep({ ...base, source: "", untouched: false }), "ring", "an editor the player cleared stays theirs");
  assert.equal(firstSummonStep({ ...base, source: "def agent(grid): return []", untouched: false }), "ring", "the player's own code is never summoned for them");
  assert.equal(firstSummonStep({ ...base, enabled: false }), "ring", "Summon is off (the forge says why): show where it is");
  assert.equal(firstSummonStep({ ...base, agents: 1 }), "ring", "not a first agent any more");
});

test("a name the player already uses gets the next free number, unless they typed it themselves", () => {
  assert.equal(nextFreeName("Simple spread keeper", ["Simple spread keeper"]), "Simple spread keeper 2");
  assert.equal(nextFreeName("Simple spread keeper", ["Simple spread keeper", "Simple spread keeper 2"]), "Simple spread keeper 3");
  assert.equal(nextFreeName("Simple spread keeper 2", ["Simple spread keeper", "Simple spread keeper 2"]), "Simple spread keeper 3", "a numbered name counts on");
  assert.equal(nextFreeName("Keeper", ["keeper ", undefined]), "Keeper 2", "case and outer spaces do not make a name new");
  assert.equal(nextFreeName("Keeper", ["Other"]), "Keeper", "a free name stays");
  assert.equal(nextFreeName("x".repeat(40), ["x".repeat(40)], 40), `${"x".repeat(38)} 2`, "within the name's length limit");
  assert.equal(proposedName({ name: "Keeper", typed: false, existing: ["Keeper"] }), "Keeper 2");
  assert.equal(proposedName({ name: "Keeper", typed: true, existing: ["Keeper"] }), null, "a typed name is never changed for the player");
  assert.equal(proposedName({ name: "Keeper", typed: false, existing: [] }), null);
  assert.equal(proposedName({ name: " ", typed: false, existing: [""] }), null);
});

test("with an agent already in the game the forge says what another one means", () => {
  assert.equal(secondAgentHint(0), null);
  assert.equal(secondAgentHint(undefined), null);
  assert.equal(secondAgentHint(1), "A second agent runs beside the first. To replace the first one instead, destroy it in My agents.");
  assert.equal(secondAgentHint(3), "A new agent runs beside the ones you have. To replace one instead, destroy it in My agents.");
});

test("the summoned line says why the player's own store shrank", () => {
  assert.equal(storeAfterSummonText({ share: 0.5, capacity: 480 }), "Half of your power now feeds this agent, so your own store is smaller: at most 480 ⚡.");
  assert.equal(storeAfterSummonText({ share: 0.25, capacity: 360.4 }), "25% of your power now feeds this agent, so your own store is smaller: at most 360 ⚡.");
  assert.equal(storeAfterSummonText({ share: 0.5, capacity: undefined }), null, "a game with no capacity");
  assert.equal(storeAfterSummonText({ share: 0.5, capacity: Infinity }), null);
  assert.equal(storeAfterSummonText({ share: undefined, capacity: 480 }), null);
  assert.equal(storeAfterSummonText({ share: 0, capacity: 480 }), null);
});

test("the same code again is called a copy; a template replaces lost-able code only after asking", () => {
  const mine = [{ source: py.source, language: "python" }];
  assert.equal(isCopy(py.source, "python", mine), true);
  assert.equal(isCopy(py.source, "typescript", mine), false);
  assert.equal(isCopy(py.source + "\n# changed", "python", mine), false);
  assert.equal(isCopy("", "python", [{ source: "", language: "python" }]), false);
  assert.match(COPY_HINT, /^You already have this agent\./);
  assert.equal(replaceNeedsConfirm({ source: "def agent(grid): return []", untouched: false, copy: false }), true, "the player's own unsummoned code would be lost");
  assert.equal(replaceNeedsConfirm({ source: py.source, untouched: true, copy: false }), false, "the untouched example can be had again");
  assert.equal(replaceNeedsConfirm({ source: py.source, untouched: false, copy: true }), false, "the code of a summoned agent is kept by that agent");
  assert.equal(replaceNeedsConfirm({ source: " ", untouched: false, copy: false }), false);
});
