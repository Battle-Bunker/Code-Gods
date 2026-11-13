/**
 * The forge's first-agent pre-fill (src/core/panels/first-agent.ts). What would break: a new player facing an empty
 * editor, an example that overwrites what the player typed, an example that comes back after the player cleared it,
 * a stale Python example left in the editor after switching to TypeScript, or the editor of a player who already has
 * agents changing by itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_AGENT_HINT, STARTER_AGENT_HINT, armedStep, armedText, energyHint, firstAgentFill, firstAgentHint, untouchedExample, lacksEnergy, readyText, summonReady, summonedText, COPY_HINT, REPLACE_WHY, descriptionToSend, keepsNameNote, priceKey, rememberPrice, startsWithLine, summonShare, replaceBoundary, starterSwap, DIFFERENT_IDEAS, PRICE_AFTER_CHECK, replaceQuestion, shelfOpen, starterShelf, COMPARISON_CAVEAT, previousTarget, putBackLabel, putBackText, BUSY_NOTHING_CHANGED, afterCheck, checkedLine, versionComparison, PENDING_REPLACE_MS, pendingReplaceOnReceipt, pendingReplaceOnSend, sameVersionNote, draftOrigin, replaceLabel, replaceOffer, replacedText, FIRST_SUMMON_MAX_AGE_MS, FIRST_SUMMON_WARMING_MS, firstSummonLabel, isCopy, replaceNeedsConfirm, firstSummonStep, nextFreeName, proposedName, secondAgentHint, storeAfterSummonText, type ArmedSummon, type Examples, type FirstAgentState,
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
  const base = { requested: true, busy: false, agents: 0 as number | undefined, source: py.source, untouched: true, filling: false, enabled: true, warming: false, first: true, ageMs: 500 };
  assert.equal(firstSummonStep({ ...base, requested: false }), "idle");
  assert.equal(firstSummonStep(base), "summon", "the pre-filled example: one click summons it");
  assert.equal(firstSummonStep({ ...base, busy: true }), "wait", "never beside a command in flight");
  assert.equal(firstSummonStep({ ...base, agents: undefined, source: "", untouched: false }), "wait", "the agent list is still loading: the example may yet arrive");
  assert.equal(firstSummonStep({ ...base, source: "", untouched: false, filling: true }), "wait", "the example is about to be put in the editor");
  assert.equal(firstSummonStep({ ...base, source: "", untouched: false }), "ring", "an editor the player cleared stays theirs");
  assert.equal(firstSummonStep({ ...base, source: "def agent(grid): return []", untouched: false }), "ring", "the player's own code is never summoned for them");
  assert.equal(firstSummonStep({ ...base, enabled: false }), "ring", "Summon is off (the forge says why): show where it is");
  assert.equal(firstSummonStep({ ...base, agents: 1 }), "ring", "not a first agent any more");
  // The sandbox is still warming (the start of planning): Summon is off, but the request waits for it instead of being used up.
  assert.equal(firstSummonStep({ ...base, enabled: false, warming: true }), "wait");
  assert.equal(firstSummonStep({ ...base, enabled: false, warming: true, ageMs: 30_000 }), "wait", "a warming sandbox may take longer than a click lasts");
  assert.equal(firstSummonStep({ ...base, enabled: false, warming: true, ageMs: FIRST_SUMMON_WARMING_MS + 1 }), "expire");
  assert.equal(firstSummonStep({ ...base, enabled: false, warming: true, untouched: false, source: "def agent(grid): return []" }), "ring", "the player's own code never waits to be summoned for them");
  // A request never outlives its click: after 10 s it is dropped, not acted on.
  assert.equal(firstSummonStep({ ...base, ageMs: FIRST_SUMMON_MAX_AGE_MS + 1 }), "expire");
  assert.equal(firstSummonStep({ ...base, busy: true, ageMs: FIRST_SUMMON_MAX_AGE_MS + 1 }), "expire");
  // This editor already summoned an agent (the agent list may lag the receipt): a second press never buys a second copy.
  assert.equal(firstSummonStep({ ...base, first: false }), "ring");
  assert.equal(firstSummonStep({ ...base, first: false, enabled: false, warming: true }), "ring");
  // What the banner's button says meanwhile.
  assert.equal(firstSummonLabel({ summoning: true, pending: true }), "Summoning…");
  assert.equal(firstSummonLabel({ summoning: false, pending: true }), "Getting ready…");
  assert.equal(firstSummonLabel({ summoning: false, pending: false }), "Summon my first agent");
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

test("the summoned line says what share the agent took and what the player keeps, from the real numbers", () => {
  // 64 ⚡/s: a first agent takes three quarters, the player keeps 16 ⚡/s.
  assert.equal(storeAfterSummonText({ share: 0.75, income: 16 }), "Three quarters of your power now feeds this agent; you keep 16 ⚡/s for replacing it or adding another.");
  assert.equal(storeAfterSummonText({ share: 0.5, income: 32 }), "Half of your power now feeds this agent; you keep 32 ⚡/s for replacing it or adding another.");
  assert.equal(storeAfterSummonText({ share: 0.125, income: 8 }), "13% of your power now feeds this agent; you keep 8 ⚡/s for replacing it or adding another.");
  assert.equal(storeAfterSummonText({ share: 0.25, income: 0 }), "25% of your power now feeds this agent; you keep none for yourself, so you cannot summon or replace until you take some back in My agents.");
  assert.equal(storeAfterSummonText({ share: undefined, income: 16 }), null);
  assert.equal(storeAfterSummonText({ share: 0.75, income: undefined }), null, "the player's income is not known: nothing is guessed");
  assert.equal(storeAfterSummonText({ share: 0, income: 64 }), null);
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

test("an edited copy of an agent the player has is offered as a replacement, not as a second agent that fights the first", () => {
  const mine = [{ id: "a1", name: "Simple spread keeper", source: py.source, language: "python" }, { id: "a2", name: "Other", source: "def agent(grid): return []", language: "python" }];
  // The draft's origin: the agent whose code the editor held; it stays while that code is being edited.
  assert.equal(draftOrigin(null, py.source, "python", mine), "a1");
  assert.equal(draftOrigin("a1", py.source + "\n# 2 and 5", "python", mine), "a1", "an edit keeps the origin");
  assert.equal(draftOrigin("a1", "def agent(grid): return []", "python", mine), "a2", "the code of another agent: that one");
  assert.equal(draftOrigin("a1", py.source + "x", "python", [mine[1]]), null, "the origin was destroyed");
  assert.equal(draftOrigin(null, "something new", "python", mine), null);
  assert.equal(draftOrigin("a1", "", "python", mine), null, "an emptied editor starts afresh");
  assert.equal(draftOrigin("a1", py.source, "typescript", mine), "a1", "another language is still an edit of it");
  // Offered only for a changed draft of an agent that exists.
  assert.equal(replaceOffer(mine[0], py.source + "\n# 2 and 5"), true);
  assert.equal(replaceOffer(mine[0], py.source), false, "unchanged: that is a copy (isCopy), not a new version");
  assert.equal(replaceOffer(undefined, "anything"), false);
  assert.equal(replaceOffer(mine[0], "  "), false);
  assert.equal(replaceLabel("Simple spread keeper"), "Replace Simple spread keeper with this version");
  assert.equal(REPLACE_WHY, "Two agents with different ideas undo each other's work; replacing keeps one.");
});

test("a replace accepted only through a retry still writes its confirmation and memory; an abandoned one writes nothing", () => {
  const pending = { commandId: "c1", agentId: "a1", name: "Keeper", source: "S", at: 1_000 };
  // The receipt of the pending replace, on whichever path it arrives (the first send, "Try again", "Retry the same command").
  assert.equal(pendingReplaceOnReceipt(pending, "c1", { accepted: true }), "done");
  assert.equal(pendingReplaceOnReceipt(pending, "c1", { accepted: false }), "clear", "refused: nothing changed");
  assert.equal(pendingReplaceOnReceipt(pending, "c1", undefined), "keep", "no answer yet: the retry may still be accepted");
  assert.equal(pendingReplaceOnReceipt(pending, "c2", { accepted: true }), "keep", "another command's receipt");
  assert.equal(pendingReplaceOnReceipt(null, "c1", { accepted: true }), "none");
  // Sending: the same envelope again keeps it; any other command means the player moved on, so it is dropped.
  assert.equal(pendingReplaceOnSend(pending, "c1", 5_000), "keep");
  assert.equal(pendingReplaceOnSend(pending, "c9", 5_000), "clear");
  assert.equal(pendingReplaceOnSend(pending, "c1", 1_000 + PENDING_REPLACE_MS + 1), "clear", "it expires");
  assert.equal(pendingReplaceOnSend(null, "c1", 5_000), "none");
});

test("a replace is one command: the confirmation says the price in ⚡, in our own words", () => {
  assert.equal(replacedText("Simple spread keeper", { cost: 178.4 }), "Replaced: Simple spread keeper now runs your new version for 178 ⚡.");
  assert.equal(replacedText("Simple spread keeper"), "Replaced: Simple spread keeper now runs your new version.", "price unknown: not guessed");
  assert.ok(!/bits/.test(replacedText("Keeper", { cost: 178.4 })));
  // Two agents run the old version: only the one the draft came from is replaced, and the pane says so.
  const twins = [{ id: "a1", name: "Keeper", source: "S" }, { id: "a2", name: "Keeper 2", source: "S" }, { id: "a3", name: "Other", source: "T" }];
  assert.equal(sameVersionNote(twins[0], twins), "You have 2 agents running the old version; this replaces Keeper only.");
  assert.equal(sameVersionNote(twins[2], twins), null);
});

test("one press: the check goes straight on when the code is valid and payable, and stops with the reason otherwise", () => {
  assert.equal(afterCheck({ accepted: true, valid: true, cost: 174, energy: 400 }), "go");
  assert.equal(afterCheck({ accepted: true, valid: false, cost: 0, energy: 400 }), "invalid");
  assert.equal(afterCheck({ accepted: false, valid: undefined, cost: undefined, energy: 400 }), "invalid", "the sandbox was not ready: the forge says so");
  assert.equal(afterCheck(undefined), "invalid", "no answer");
  assert.equal(afterCheck({ accepted: true, valid: true, cost: 425, energy: 226 }), "short", "valid but not payable yet: the energy line says when");
  assert.equal(afterCheck({ accepted: true, valid: true, cost: 174, energy: 174 }), "go");
  assert.equal(checkedLine(174.382, "replace"), "Checked: 174.4 ⚡. Replacing…");
  assert.equal(checkedLine(174, "summon"), "Checked: 174 ⚡. Summoning…");
});


test("did the change help: before against the new version's FIRST moves, frozen at 20, with the caveat", () => {
  const before = { moves: 20, points: 162, objects: 9 };
  assert.equal(versionComparison(before, { moves: 7, points: 300 }), null, "fewer than 8 counted moves: too early to say");
  assert.equal(versionComparison(before, undefined), null);
  assert.equal(versionComparison(before, { moves: 12, points: 267.6, frozen: false }), "Before your change: +8.1 points a move. Since: +22.3 a move so far, over its first 12 moves.");
  assert.equal(versionComparison(before, { moves: 20, points: -70, frozen: true }), "Before your change: +8.1 points a move. Since: −3.5 a move over its first 20 moves.");
  assert.equal(versionComparison(undefined, { moves: 20, points: -70, frozen: true }), "Since your change: −3.5 points a move over its first 20 moves. Nothing was counted for the version before it.");
  assert.equal(versionComparison({ moves: 0, points: 0 }, { moves: 9, points: 18 }), "Since your change: +2 points a move so far, over its first 9 moves. Nothing was counted for the version before it.");
  assert.equal(versionComparison(before, { moves: 20, points: -70, frozen: true }, { estimate: true }), "Before your change: about +8.1 points a move. Since: about −3.5 a move over its first 20 moves.");
  // After a put-back: how the restored version is doing, in the same terms.
  assert.equal(versionComparison(undefined, { moves: 20, points: 720, frozen: true }, { restored: true }), "Back on the previous version: +36 points a move over its first 20 moves since.");
  assert.equal(versionComparison(undefined, { moves: 9, points: 90 }, { restored: true }), "Back on the previous version: +10 points a move so far, over its first 9 moves since.");
  assert.equal(COMPARISON_CAVEAT, "Every agent earns most just after it starts, so read this as a rough guide; your total points over the next minute are the real test.");
});

test("the previous version belongs to one game and one agent: never a twin with the same code, never the next game", () => {
  const previous = { gameId: "g1", agentId: "a7", source: "OLD", language: "python", name: "Keeper", newSource: "NEW" };
  const live = [{ id: "a2" }, { id: "a7" }, { id: "a3" }];
  assert.deepEqual(previousTarget(previous, "g1", live), { target: "a7" }, "the agent keeps its id through a replace");
  assert.deepEqual(previousTarget(previous, "g1", [live[0]]), { clear: true }, "destroyed: the memory goes");
  assert.deepEqual(previousTarget(previous, "g2", live), { clear: true }, "another game");
  assert.deepEqual(previousTarget(previous, undefined, live), { wait: true }, "the game is not known yet");
  assert.deepEqual(previousTarget(null, "g1", live), { none: true });
});

test("putting the previous version back pays its price again and says so, before and after", () => {
  assert.equal(putBackLabel(169.2), "Put the previous version back · costs 169.2 ⚡");
  assert.equal(putBackLabel(undefined), "Put the previous version back · costs its summon price again");
  assert.equal(putBackText("Keeper"), "Put back: Keeper runs the previous version again.");
  assert.equal(putBackText("Keeper", { cost: 169.2 }), "Put back: Keeper runs the previous version again for 169 ⚡.");
  assert.equal(BUSY_NOTHING_CHANGED, "The game is busy; nothing changed. Try again.");
});

test("the starter shelf: ready-made agents to pick without typing, each marked by where it already is", () => {
  const starters = [
    { id: "tiny", title: "Simple", blurb: "A short agent that costs little to summon and does the simple part of my goal.", name: "Simple spread keeper", source: "S", specific: true },
    { id: "thorough", title: "Thorough", blurb: "A longer agent that chases every part of my goal. It costs more to summon.", name: "Spread keeper", source: "T", specific: true },
    { id: "bold", title: "Bold", blurb: "Bigger changes each turn.", name: "Bold spread keeper", source: "B", specific: true },
  ];
  const rows = starterShelf(starters, { source: "S", agents: [{ source: "S", name: "Simple spread keeper" }, { source: "B", name: "Bold spread keeper" }] });
  assert.deepEqual(rows.map(r => [r.id, r.state]), [["tiny", "editor"], ["thorough", "available"], ["bold", "running"]]);
  // The blurbs are the player's own goal, said to the player.
  assert.equal(rows[0].blurb, "A short agent that costs little to summon and does the simple part of your goal.");
  assert.equal(rows[1].note, PRICE_AFTER_CHECK);
  assert.equal(rows[0].note, "In the editor now.");
  assert.equal(rows[2].note, "You are running this one (Bold spread keeper).");
  assert.equal(PRICE_AFTER_CHECK, "Its price is shown after Check.");
  // Once a starter has been checked on this page its price is shown beside it (from the check, never a constant).
  const priced = starterShelf(starters, { source: "S", agents: [], language: "python", prices: new Map([[priceKey("python", "T"), 349.5], [priceKey("python", "S"), 169.2], [priceKey("typescript", "U"), 99]]) });
  assert.equal(priced[1].note, "It costs about 350 ⚡ to summon.");
  assert.equal(priced[0].note, "In the editor now. It costs about 169 ⚡ to summon.");
  assert.equal(priced[2].note, PRICE_AFTER_CHECK);
  // A starter that does not chase the goal is not offered as a choice beside real ones; alone, it stays.
  const fallback = { id: "careful", title: "Careful", blurb: "A starter that does not chase my goal yet.", name: "First agent", source: "F", specific: false };
  assert.deepEqual(starterShelf([fallback], { source: "", agents: [] }).map(r => r.id), ["careful"]);
  assert.equal(replaceQuestion("Thorough"), "Replace the code in the editor with the Thorough agent? Your summoned agents are not affected.");
  assert.equal(DIFFERENT_IDEAS, "Two agents with different ideas can undo each other's work; watch your points.");
});

test("the shelf opens by itself once the player has an agent and the energy for another like it", () => {
  assert.equal(shelfOpen({ agents: [], energy: 960 }), false, "before the first agent: closed");
  assert.equal(shelfOpen({ agents: [{ summonCost: 170 }], energy: 480 }), true);
  assert.equal(shelfOpen({ agents: [{ summonCost: 170 }], energy: 120 }), false, "not enough to spare");
  assert.equal(shelfOpen({ agents: [{ summonCost: undefined }], energy: 120 }), true, "no price known: about 100 is enough");
  assert.equal(shelfOpen({ agents: [{ summonCost: 170 }], energy: 480, ended: true }), false);
});

test("switching the language swaps an untouched starter of any kind for the same starter in the new language", () => {
  const byLanguage = {
    python: [{ id: "tiny", source: "PY-S" }, { id: "thorough", source: "PY-T" }],
    typescript: [{ id: "tiny", source: "TS-S" }, { id: "thorough", source: "TS-T" }],
  };
  assert.equal(starterSwap("PY-T", "typescript", byLanguage), "TS-T", "the Thorough one stays the Thorough one");
  assert.equal(starterSwap("PY-S", "typescript", byLanguage), "TS-S");
  assert.equal(starterSwap("TS-T", "typescript", byLanguage), null, "already this language's");
  assert.equal(starterSwap("PY-T edited", "typescript", byLanguage), null, "the player's own code is never swapped");
  assert.equal(starterSwap("PY-T", "typescript", { python: byLanguage.python, typescript: [{ id: "tiny", source: "TS-S" }] }), null, "no such starter in the new language: left alone");
  assert.equal(starterSwap("", "typescript", byLanguage), null);
});

test("the 'since' boundary of a replace is its own agent.replaced event, never an earlier replace's", () => {
  const previous = { gameId: "g1", agentId: "a7", source: "OLD", language: "python", name: "Keeper", newSource: "NEW", sentWorld: 100 };
  const replacedAt = (world: number, agentId = "a7") => ({ type: "agent.replaced", agentId, worldSeconds: world });
  // The receipt came before the new event: the page still holds the PREVIOUS replace's event (world 40). Not taken.
  assert.deepEqual(replaceBoundary(previous, [replacedAt(40)], 101.5), { world: 101.5, fromEvent: false }, "until its own event arrives: the time the receipt was seen");
  // Its own event arrives (at or after the press): it overwrites the stand-in.
  assert.deepEqual(replaceBoundary({ ...previous, replacedWorld: 101.5, fromEvent: false }, [replacedAt(40), replacedAt(100.8)], 104), { world: 100.8, fromEvent: true });
  assert.equal(replaceBoundary({ ...previous, replacedWorld: 100.8, fromEvent: true }, [replacedAt(40), replacedAt(100.8)], 110), null, "settled: nothing more to change");
  assert.equal(replaceBoundary({ ...previous, replacedWorld: 101.5, fromEvent: false }, [replacedAt(40)], 110), null, "the stand-in is not moved by the clock");
  assert.deepEqual(replaceBoundary(previous, [replacedAt(100.2, "other")], 101), { world: 101, fromEvent: false }, "another agent's replace is not this one's");
  assert.equal(replaceBoundary(previous, [], undefined), null, "no event and no clock yet: wait");
  assert.equal(replaceBoundary(null, [replacedAt(100.8)], 101), null);
});

test("a beginner's first agent asks for as much power as still leaves a store for the dearest starter; anything else takes the engine's default", () => {
  // Annotated basics: P = 64, T = 30 (planning store 1,920); the dearest starter 572.2 (BEGINNER_AGENT_BUDGET_BITS 573).
  const beginner = { agents: 0, allocated: 0, beginner: true, firstSent: false, powerPerSecond: 64, fullChargeSeconds: 30 } as const;
  const share = summonShare(beginner)!;
  assert.equal(share, 0.701562);
  assert.ok((1 - share) * 64 * 30 >= 573, "the store after the summon holds the dearest starter, so Replace with it is never refused for good");
  assert.equal(summonShare({ ...beginner, price: 700 }), 0.635416, "a dearer agent being summoned: its own price is kept payable too");
  assert.equal(summonShare({ ...beginner, prices: [100, 650] }), 0.661458, "a dearer starter remembered in this game");
  assert.equal(summonShare({ ...beginner, beginner: false }), undefined, "any other setup: the engine's default");
  assert.equal(summonShare({ ...beginner, firstSent: true }), undefined, "this game's first summon already sent: a second one right after takes the default");
  assert.equal(summonShare({ ...beginner, agents: 1, allocated: 0.7 }), undefined, "a later agent: half of what is unallocated, the engine's own default");
  assert.equal(summonShare({ ...beginner, agents: undefined }), undefined, "the agent list is not known yet: the default");
  assert.equal(summonShare({ ...beginner, allocated: 0.5 }), undefined, "power already given out with no agent listed: nothing above the default is left");
  assert.equal(summonShare({ ...beginner, allocated: undefined }), undefined, "the state has not arrived: the default");
  assert.equal(summonShare({ ...beginner, fullChargeSeconds: undefined }), undefined, "a game with no capacity: the default");
  assert.equal(summonShare({ ...beginner, powerPerSecond: 8, fullChargeSeconds: 60 }), undefined, "a small store (Int and string worlds): the default");
});

test("the summon preview says what the new agent starts with when the player's store would overflow its new limit", () => {
  // 64 ⚡/s, full in 30 s: whole = 1,920. Nothing allocated, a 75% share: the player's own limit becomes 0.25 × 1,920 = 480.
  // With 960 − 300 = 660 left after paying, 180 no longer fits and moves to the agent.
  assert.equal(startsWithLine({ energy: 960, cost: 300, allocated: 0, share: 0.75, powerPerSecond: 64, fullChargeSeconds: 30 }), "It starts with 180 ⚡ of your energy that would no longer fit in your own store.");
  assert.equal(startsWithLine({ energy: 700, cost: 300, allocated: 0, share: 0.75, powerPerSecond: 64, fullChargeSeconds: 30 }), null, "400 left fits in 480");
  assert.equal(startsWithLine({ energy: 960, cost: 300, allocated: 0, share: 0.75, powerPerSecond: 64, fullChargeSeconds: undefined }), null, "a game with no capacity");
  assert.equal(startsWithLine({ energy: 960, cost: 300, allocated: 0, share: undefined, powerPerSecond: 64, fullChargeSeconds: 30 }), null);
  assert.equal(startsWithLine({ energy: 960, cost: 1200, allocated: 0, share: 0.75, powerPerSecond: 64, fullChargeSeconds: 30 }), null, "not payable: nothing to say about what is left");
  assert.equal(startsWithLine({ energy: 960, cost: 300, allocated: 0, share: 0.75, powerPerSecond: 64, fullChargeSeconds: 30, beside: true }),
    "Summoned beside it, the new agent starts with 180 ⚡ of your energy that would no longer fit in your own store.", "with Replace offered, the line is about the other button");
});

test("Summon beside it sends only a description the player changed, not the replaced agent's own", () => {
  assert.equal(descriptionToSend("Keeps rows mirrored", "Keeps rows mirrored"), undefined);
  assert.equal(descriptionToSend("Mirrors columns now", "Keeps rows mirrored"), "Mirrors columns now");
});

test("a starter's price is remembered per game, language and source, and forgotten in another game", () => {
  const one = rememberPrice({ gameId: "", prices: new Map() }, "g1", priceKey("python", "S"), 169.2);
  assert.equal(one.prices.get(priceKey("python", "S")), 169.2);
  assert.equal(one.prices.get(priceKey("typescript", "S")), undefined, "another language's price is its own");
  assert.equal(rememberPrice(one, "g1", priceKey("python", "S"), 169.2), one, "the same price again changes nothing");
  const next = rememberPrice(one, "g2", priceKey("python", "T"), 350);
  assert.deepEqual([...next.prices.keys()], [priceKey("python", "T")], "a new game starts with no prices");
});

test("a replace sends a description only when the player changed it for this draft; the name box says the name is kept", () => {
  assert.equal(descriptionToSend("Only looks", "Only looks"), undefined, "the agent's own description, untouched: not sent (the engine keeps it)");
  assert.equal(descriptionToSend("Pairs to nine, boldly", "Pairs to nine"), "Pairs to nine, boldly");
  assert.equal(descriptionToSend("  ", "Pairs to nine"), undefined, "an emptied box is not a new description");
  assert.equal(descriptionToSend("New", undefined), "New");
  assert.equal(keepsNameNote("Mirror maker"), "Replacing keeps the name Mirror maker. A new name here is for 'Summon beside it'.");
});
