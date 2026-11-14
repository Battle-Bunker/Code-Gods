/**
 * The act log's sentence (src/panes/move-line.ts), ported from v1's score-line tests for ux-lessons 2.2 and 2.3:
 * the change, the step before → after, ✨ rarity with its reason, the points with the want (both values when it
 * changed), and the factor that moved when the points go against the step.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineType } from "@workspace/v2-linear";
import { callWords, moveSentence, moveWho, pointsCause, stepText, wantText, type MoveSnap } from "../src/panes/move-line.ts";

const snap = (level: number, rarityBits: number, want: number, points: number, scoring = true): MoveSnap =>
  ({ score: scoring ? [String(level)] : null, level, rarityBits, want, points });
const change = { before: "y = −3x + 10", after: "y = −3x + 9" };
const who = "Your agent Tank-1";

test("the storyboard's line: the change, the step, the ✨ rarity with its reason, the points with the want", () => {
  assert.equal(moveSentence({ who, change, what: "move the line down 1", top: 8, before: snap(5, 3.4, 2.4, 8.16), after: snap(8, 6.8, 2.4, 16.32) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Up: step 5 → 8 of 8. ✨ rarity 3.4 → 6.8 (fewer random lines score this well). Points on this line 8.2 → 16.3 (the others want it 2.4).");
});

test("when the others' want changed, both values are shown, so the before points can be checked", () => {
  // Catches: two walkers checked "before = rarity × want" against the new want and concluded the numbers were wrong.
  assert.equal(moveSentence({ who, change, top: 8, before: snap(5, 3.4, 2.4, 8.16), after: snap(8, 6.8, 2.1, 14.28) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Up: step 5 → 8 of 8. ✨ rarity 3.4 → 6.8 (fewer random lines score this well). Points on this line 8.2 → 14.3 (the others want it 2.1, was 2.4).");
  assert.equal(wantText(2.4, 2.41), "the others want it 2.4", "the same when shown: said once");
  assert.equal(wantText(0.02), "the others do not want it", "what shows as 0.0 is none");
  assert.equal(wantText(-1.2), "the others would rather not have it: −1.2");
});

test("points moving against the step say why: the factor whose own change pushed them that way", () => {
  const head = "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Up: step 5 → 6 of 8. ✨ rarity 25.5 → 25.9 (fewer random lines score this well). ";
  // Up a step, but the others want it less: 25.525 × 4 = 102.1, 25.9 × 3.8 = 98.42.
  assert.equal(moveSentence({ who, change, top: 8, before: snap(5, 25.525, 4, 102.1), after: snap(6, 25.9, 3.8, 98.42) }),
    `${head}Points on this line 102.1 → 98.4 (the others want it 3.8, was 4.0), because the others want this line less now.`);
  // The step stayed, the others want it more: 10 × 2 = 20, 10 × 2.5 = 25.
  assert.equal(moveSentence({ who, top: 8, before: snap(5, 10, 2, 20), after: snap(5, 10, 2.5, 25) }),
    "Your agent Tank-1 changed a line. Still step 5 of 8. Points on this line 20.0 → 25.0 (the others want it 2.5, was 2.0), because the others want this line more now.");
  // Down a step, yet the others want it more (only that explains the rise): 10 × 2 = 20, 9 × 3 = 27.
  assert.equal(pointsCause(snap(5, 10, 2, 20), snap(4, 9, 3, 27)), "the others want this line more now");
  // Up a step that is no rarer here (the ladder was recalibrated around it): 30 × 4 = 120, 25 × 4 = 100.
  assert.equal(pointsCause(snap(4, 30, 4, 120), snap(5, 25, 4, 100)), "this line is less rare by your rule now");
  // Both fell: 30 × 4 = 120, 25 × 3 = 75.
  assert.equal(pointsCause(snap(4, 30, 4, 120), snap(5, 25, 3, 75)), "the others want this line less now and this line is less rare by your rule now");
});

test("against the step with figures that explain nothing: the rule is said, never a guessed cause", () => {
  assert.equal(moveSentence({ who, top: 8, before: snap(4, 10, 4, 50), after: snap(5, 10, 4, 40) }),
    "Your agent Tank-1 changed a line. Up: step 4 → 5 of 8. Points on this line 50.0 → 40.0 (the others want it 4.0). A line's points are your ✨ rarity on it × how much the others want it, not the step alone.");
});

test("both moving the same way needs no reason; a line with no points says which side is 0", () => {
  assert.equal(moveSentence({ who, top: 8, before: snap(3, 5, 4, 20), after: snap(2, 3.25, 4, 13) }),
    "Your agent Tank-1 changed a line. Down: step 3 → 2 of 8. ✨ rarity 5.0 → 3.3 (more random lines score this well). Points on this line 20.0 → 13.0 (the others want it 4.0).");
  assert.equal(moveSentence({ who, top: 8, before: snap(3, 2, 0, 0), after: snap(4, 2.5, 0, 0) }),
    "Your agent Tank-1 changed a line. Up: step 3 → 4 of 8. ✨ rarity 2.0 → 2.5 (fewer random lines score this well). No points on this line yet: the others do not want it.");
  assert.equal(moveSentence({ who, top: 8, before: snap(0, 0, 3.2, 0, false), after: snap(0, 0, 3.2, 0) }),
    "Your agent Tank-1 changed a line. Up: not scoring → step 0 of 8. No points on this line yet: it is not rare by your rule yet.");
});

test("the step in words, with or without the ladder's top, and not scoring below every step", () => {
  assert.equal(stepText(snap(3, 1, 1, 1), snap(0, 0, 1, 0, false), 8), "Down: step 3 of 8 → not scoring");
  assert.equal(stepText(snap(0, 0, 1, 0, false), snap(0, 0, 1, 0, false), 8), "Still not scoring");
  assert.equal(stepText(snap(2, 1, 1, 1), snap(5, 1, 1, 1)), "Up: step 2 → 5");
  assert.equal(stepText(snap(5, 1, 1, 1), snap(5, 1, 1, 1)), "Still step 5");
});

test("who moved it: the viewer's own agent by name, or another player's", () => {
  assert.equal(moveWho({ mine: true, agentId: "a1" }, "Tank-1"), "Your agent Tank-1");
  assert.equal(moveWho({ mine: true, agentId: "a1" }, undefined), "Your agent", "a destroyed agent has no row to name it");
  assert.equal(moveWho({ mine: false, agentId: null }), "Another player's agent");
  assert.equal(moveSentence({ who: moveWho({ mine: false, agentId: null }), top: 8, before: snap(8, 6.8, 2.4, 16.32), after: snap(5, 3.4, 2.4, 8.16) }),
    "Another player's agent changed a line. Down: step 8 → 5 of 8. ✨ rarity 6.8 → 3.4 (more random lines score this well). Points on this line 16.3 → 8.2 (the others want it 2.4).");
});

test("the calls in words, from the line's own mutators", () => {
  const z = lineType.variants.find(v => v.id === "line-z")!;
  assert.equal(callWords([{ mutator: "si.shift", site: 0, args: { k: "-1" } }], z), "move the line down 1");
  assert.equal(callWords([{ mutator: "si.shift", site: 0, args: { k: "-1" } }, { mutator: "si.shift", site: 0, args: { k: "2" } }], z), "move the line down 1, then move the line up 2");
  assert.equal(callWords([{ mutator: "si.shift", site: 0, args: { k: "1/2" } }], z), "move the line up or down", "arguments outside the variant: the mutator's title");
  assert.equal(callWords([{ mutator: "no.such", site: 0, args: {} }], z), null);
});

test("no sentence uses the words walkers did not understand", () => {
  const lines = [
    moveSentence({ who, change, top: 8, before: snap(5, 3.4, 2.4, 8.16), after: snap(8, 6.8, 2.1, 14.28) }),
    moveSentence({ who, top: 8, before: snap(4, 10, 4, 50), after: snap(5, 10, 4, 40) }),
    moveSentence({ who, top: 8, before: snap(3, 2, 0, 0), after: snap(4, 2.5, 0, 0) }),
  ];
  for (const l of lines) assert.doesNotMatch(l, /\b(grid|object|bits|payoff)s?\b/i);
});
