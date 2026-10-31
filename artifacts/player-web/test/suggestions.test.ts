/**
 * The assistant pane's zero-token guidance (src/core/chat/suggestions.ts): the phase's empty-state copy and at most
 * three prompt chips, which become palette commands when the assistant is off. A chip with neither a prompt nor a
 * command, or a fourth chip, would break the control budget or leave a newcomer with a dead button. Also the
 * overview lens's one next step (src/lenses/next-step.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { emptyStateFor, suggestionsFor, type SuggestionContext } from "../src/core/chat/suggestions.ts";
import { nextStep } from "../src/lenses/next-step.ts";

const PHASES = ["lobby", "planning", "running", "paused", "ended"] as const;
const ctx = (over: Partial<SuggestionContext> = {}): SuggestionContext =>
  ({ phase: "running", seated: true, isOwner: false, agents: 1, ready: false, members: 4, assistantOn: true, ...over });

test("every phase offers one to three chips; each sends a prompt when the assistant is on and runs a command when it is off", () => {
  for (const phase of PHASES) {
    for (const assistantOn of [true, false]) {
      const chips = suggestionsFor(ctx({ phase, assistantOn }));
      assert.ok(chips.length >= 1 && chips.length <= 3, `${phase}: ${chips.length} chips`);
      for (const chip of chips) {
        assert.ok(chip.label.length > 0 && chip.label.length <= 40, chip.label);
        if (assistantOn) assert.ok(chip.prompt || chip.command, `${phase}: ${chip.label} does nothing`);
        else assert.ok(chip.command && !chip.prompt, `${phase}: ${chip.label} needs the assistant`);
      }
      assert.equal(new Set(chips.map(c => c.label)).size, chips.length, "no duplicates");
    }
  }
});

test("the phase decides the chips (player-client.md §4)", () => {
  assert.deepEqual(suggestionsFor(ctx({ phase: "lobby", agents: 0 })).map(c => c.label), ["How does this game work?", "Who's in the room?", "I'm ready"]);
  assert.deepEqual(suggestionsFor(ctx({ phase: "planning", agents: 0 })).map(c => c.label), ["Explain my goal simply", "Write me a first agent", "What should my agent do?"]);
  assert.deepEqual(suggestionsFor(ctx({ phase: "running" })).map(c => c.label), ["What should I do next?", "Which objects matter to me?", "What do the others want?"]);
  assert.deepEqual(suggestionsFor(ctx({ phase: "paused" })).map(c => c.label), ["What changed?", "Draft a public proposal", "Should I change my agents?"]);
  assert.deepEqual(suggestionsFor(ctx({ phase: "ended" })).map(c => c.label), ["Why did I finish there?", "What would have worked better?", "Show the results"]);
});

test("the situation adjusts them: ready, an owner short of players, no agent yet, a spectator", () => {
  assert.ok(!suggestionsFor(ctx({ phase: "lobby", ready: true })).some(c => c.label === "I'm ready"), "no 'I'm ready' once ready");
  const owner = suggestionsFor(ctx({ phase: "lobby", isOwner: true, members: 2 }));
  assert.equal(owner[0].label, "Add an AI player");
  assert.equal(owner[0].command, "rooms.addAi", "a command, also with the assistant on: seating an AI is an owner's form");
  assert.ok(owner.length <= 3);
  assert.ok(suggestionsFor(ctx({ phase: "running", agents: 0 })).some(c => c.label === "Write me an agent"));
  const spectator = suggestionsFor(ctx({ phase: "running", seated: false }));
  assert.ok(spectator.every(c => !/agent/i.test(c.label)), "a spectator cannot summon");
});

test("with the assistant off a chip names the command it runs, in command form", () => {
  const off = suggestionsFor(ctx({ phase: "planning", agents: 0, assistantOn: false }));
  assert.deepEqual(off.map(c => [c.label, c.command]), [
    ["Show my secret goal", "ui.lens.add.my-card"], ["Open the agent editor", "ui.forge.edit"], ["How to play", "ui.lens.add.rules"],
  ]);
});

test("empty-state copy: a greeting and one short paragraph per phase, the off state says who turns it on", () => {
  for (const phase of PHASES) {
    const { greeting, body } = emptyStateFor(phase, true);
    assert.ok(greeting.length > 0);
    assert.ok(body.split(/\s+/).length < 40, `${phase}: ${body.split(/\s+/).length} words`);
  }
  assert.match(emptyStateFor("planning", true).body, /secret goal/);
  assert.match(emptyStateFor("running", false).body, /owner/);
});

test("the overview's one next step follows the situation", () => {
  const step = (over: Partial<Parameters<typeof nextStep>[0]>) => nextStep({ phase: "running", seated: true, isOwner: false, members: 4, agents: 1, ...over });
  assert.deepEqual(step({ phase: "lobby", isOwner: true, members: 3 }).action, { kind: "start" }, "an owner with players starts the game");
  assert.deepEqual(step({ phase: "lobby", isOwner: true, members: 2 }).action, { kind: "palette", command: "rooms.addAi" }, "short of players: seat an AI");
  assert.deepEqual(step({ phase: "lobby" }).action, { kind: "lens", lensId: "rules" }, "a player waits and learns");
  assert.deepEqual(step({ phase: "planning", agents: 0 }).action, { kind: "forge" });
  assert.deepEqual(step({ phase: "running", agents: 0 }).action, { kind: "forge" });
  assert.deepEqual(step({ phase: "running" }).action, { kind: "lens", lensId: "objects" });
  assert.deepEqual(step({ phase: "running", seated: false }).action, { kind: "lens", lensId: "race" }, "a spectator watches");
  assert.deepEqual(step({ phase: "paused" }).action, { kind: "lens", lensId: "public-chat" });
  assert.deepEqual(step({ phase: "ended" }).action, { kind: "lens", lensId: "results" });
  for (const phase of PHASES) assert.ok(step({ phase }).label.length <= 30, "a short button label");
});
