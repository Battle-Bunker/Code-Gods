/**
 * The act log's sentence (src/panes/move-line.ts), ported from v1's score-line tests for ux-lessons 2.2 and 2.3:
 * the change, the step before → after, your rarity in bits with its reason, the points with the score's formula
 * (yours × others' = points, the others' bits before when they changed), and the factor that moved when the points go
 * against the step. Every product below is worked by hand.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineType } from "@workspace/v2-linear";
import { callWords, moveSentence, moveWho, pointsCause, stepText, type MoveSnap } from "../src/panes/move-line.ts";

const snap = (level: number, rarityBits: number, want: number, points: number, scoring = true): MoveSnap =>
  ({ score: scoring ? [String(level)] : null, level, rarityBits, want, points });
const change = { before: "y = −3x + 10", after: "y = −3x + 9" };
const who = "Your agent Tank-1";

test("the storyboard's line: the change, the step, your rarity with its reason, the points with yours × others' = points", () => {
  // 6.8 × 2.4 = 16.32.
  assert.equal(moveSentence({ who, change, what: "move the line down 1", top: 8, before: snap(5, 3.4, 2.4, 8.16), after: snap(8, 6.8, 2.4, 16.32) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Up: step 5 → 8 of 8. Your rarity 3.40 → 6.80 bits (fewer random lines score this well). Points on this line 8.16 → 16.32: your 6.80 bits × others' 2.40 bits = 16.32 points.");
});

test("when the others' bits changed, the earlier figure is shown, so the before points can be checked", () => {
  // Catches: two walkers checked "before = rarity × want" against the new want and concluded the numbers were wrong.
  // 3.4 × 2.4 = 8.16 before; 6.8 × 2.1 = 14.28 after.
  assert.equal(moveSentence({ who, change, top: 8, before: snap(5, 3.4, 2.4, 8.16), after: snap(8, 6.8, 2.1, 14.28) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Up: step 5 → 8 of 8. Your rarity 3.40 → 6.80 bits (fewer random lines score this well). Points on this line 8.16 → 14.28: your 6.80 bits × others' 2.10 bits = 14.28 points (others' bits were 2.40).");
});

test("points moving against the step say why: the factor whose own change pushed them that way", () => {
  // Up a step, but the others want it less: 25.5 × 4 = 102, 25.9 × 3.8 = 98.42.
  assert.equal(moveSentence({ who, change, top: 8, before: snap(5, 25.5, 4, 102), after: snap(6, 25.9, 3.8, 98.42) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Up: step 5 → 6 of 8. Your rarity 25.50 → 25.90 bits (fewer random lines score this well). "
    + "Points on this line 102.00 → 98.42, because the others want this line less now: your 25.90 bits × others' 3.80 bits = 98.42 points (others' bits were 4.00).");
  // The step stayed, the others want it more: 10 × 2 = 20, 10 × 2.5 = 25.
  assert.equal(moveSentence({ who, top: 8, before: snap(5, 10, 2, 20), after: snap(5, 10, 2.5, 25) }),
    "Your agent Tank-1 changed a line. Still step 5 of 8. Points on this line 20.00 → 25.00, because the others want this line more now: your 10.00 bits × others' 2.50 bits = 25.00 points (others' bits were 2.00).");
  // Down a step, yet the others want it more (only that explains the rise): 10 × 2 = 20, 9 × 3 = 27.
  assert.equal(pointsCause(snap(5, 10, 2, 20), snap(4, 9, 3, 27)), "the others want this line more now");
  // Up a step that is no rarer here (the ladder was recalibrated around it): 30 × 4 = 120, 25 × 4 = 100.
  assert.equal(pointsCause(snap(4, 30, 4, 120), snap(5, 25, 4, 100)), "this line is less rare by your rule now");
  // Both fell: 30 × 4 = 120, 25 × 3 = 75.
  assert.equal(pointsCause(snap(4, 30, 4, 120), snap(5, 25, 3, 75)), "the others want this line less now and this line is less rare by your rule now");
});

test("against the step with figures that explain nothing: the rule is said, never a guessed cause", () => {
  assert.equal(moveSentence({ who, top: 8, before: snap(4, 10, 4, 50), after: snap(5, 10, 4, 40) }),
    "Your agent Tank-1 changed a line. Up: step 4 → 5 of 8. Points on this line 50.00 → 40.00: your 10.00 bits × others' 4.00 bits = 40.00 points. A line's points are your bits × the others' bits, not the step alone.");
});

test("both moving the same way needs no reason; a line with no points says why", () => {
  // 3.25 × 4 = 13.
  assert.equal(moveSentence({ who, top: 8, before: snap(3, 5, 4, 20), after: snap(2, 3.25, 4, 13) }),
    "Your agent Tank-1 changed a line. Down: step 3 → 2 of 8. Your rarity 5.00 → 3.25 bits (more random lines score this well). Points on this line 20.00 → 13.00: your 3.25 bits × others' 4.00 bits = 13.00 points.");
  // Others' bits 0: only you care.
  assert.equal(moveSentence({ who, top: 8, before: snap(3, 2, 0, 0), after: snap(4, 2.5, 0, 0) }),
    "Your agent Tank-1 changed a line. Up: step 3 → 4 of 8. Your rarity 2.00 → 2.50 bits (fewer random lines score this well). No points on this line yet: your 2.50 bits × others' 0.00 bits = 0.00 points. Only you care about this line, so it scores nothing yet: it needs someone else to find it rare too.");
  assert.equal(moveSentence({ who, top: 8, before: snap(0, 0, 3.2, 0, false), after: snap(0, 0, 3.2, 0) }),
    "Your agent Tank-1 changed a line. Up: not scoring → step 0 of 8. No points on this line yet: your 0.00 bits × others' 3.20 bits = 0.00 points. It is not rare by your rule yet.");
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
  // 3.4 × 2.4 = 8.16.
  assert.equal(moveSentence({ who: moveWho({ mine: false, agentId: null }), top: 8, before: snap(8, 6.8, 2.4, 16.32), after: snap(5, 3.4, 2.4, 8.16) }),
    "Another player's agent changed a line. Down: step 8 → 5 of 8. Your rarity 6.80 → 3.40 bits (more random lines score this well). Points on this line 16.32 → 8.16: your 3.40 bits × others' 2.40 bits = 8.16 points.");
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
  for (const l of lines) assert.doesNotMatch(l, /\b(grid|object|payoff)s?\b|✨/i);
});
