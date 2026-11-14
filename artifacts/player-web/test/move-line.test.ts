/**
 * The act log's sentence (src/panes/move-line.ts), ported from v1's score-line tests for ux-lessons 2.2 and 2.3:
 * the change, your rarity in bits before → after with its chance ("1 in N by chance"; owner decision 23: no steps),
 * the points with the score's formula (yours × others' = points, the others' bits before when they changed), and the
 * factor that moved when the points go against your rarity. Every product and chance below is worked by hand
 * (2^3.4 = 10.6 → "1 in 11", 2^6.8 = 111.4 → "1 in 111").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineType } from "@workspace/v2-linear";
import { callWords, moveSentence, moveWho, pointsCause, rarityText, type MoveSnap } from "../src/panes/move-line.ts";

const snap = (rarityBits: number, want: number, points: number, scoring = true): MoveSnap =>
  ({ score: scoring ? ["1"] : null, rarityBits, want, points });
const change = { before: "y = −3x + 10", after: "y = −3x + 9" };
const who = "Your agent Tank-1";

test("the storyboard's line: the change, your rarity with its chance, the points with yours × others' = points", () => {
  // 6.8 × 2.4 = 16.32.
  assert.equal(moveSentence({ who, change, what: "move the line down 1", before: snap(3.4, 2.4, 8.16), after: snap(6.8, 2.4, 16.32) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Your rarity 3.40 → 6.80 bits: 1 in 11 → 1 in 111 by chance. Points on this line 8.16 → 16.32: your 6.80 bits × others' 2.40 bits = 16.32 points.");
});

test("no step, rung or ladder words (owner decision 23)", () => {
  const l = moveSentence({ who, change, before: snap(3.4, 2.4, 8.16), after: snap(6.8, 2.4, 16.32) });
  assert.doesNotMatch(l, /\b(step|rung|ladder|level|of 8)\b/i);
});

test("when the others' bits changed, the earlier figure is shown, so the before points can be checked", () => {
  // Catches: two walkers checked "before = rarity × want" against the new want and concluded the numbers were wrong.
  // 3.4 × 2.4 = 8.16 before; 6.8 × 2.1 = 14.28 after.
  assert.equal(moveSentence({ who, change, before: snap(3.4, 2.4, 8.16), after: snap(6.8, 2.1, 14.28) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Your rarity 3.40 → 6.80 bits: 1 in 11 → 1 in 111 by chance. Points on this line 8.16 → 14.28: your 6.80 bits × others' 2.10 bits = 14.28 points (others' bits were 2.40).");
});

test("points moving against your rarity say why: the factor whose own change pushed them that way", () => {
  // Rarer, but the others want it less: 25.5 × 4 = 102, 25.9 × 3.8 = 98.42; 2^25.5 = 47.5 million, 2^25.9 = 62.6 million.
  assert.equal(moveSentence({ who, change, before: snap(25.5, 4, 102), after: snap(25.9, 3.8, 98.42) }),
    "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9. Your rarity 25.50 → 25.90 bits: 1 in 47 million → 1 in 63 million by chance. "
    + "Points on this line 102.00 → 98.42, because the others want this line less now: your 25.90 bits × others' 3.80 bits = 98.42 points (others' bits were 4.00).");
  // Your rarity stayed, the others want it more: 10 × 2 = 20, 10 × 2.5 = 25; 2^10 = 1,024.
  assert.equal(moveSentence({ who, before: snap(10, 2, 20), after: snap(10, 2.5, 25) }),
    "Your agent Tank-1 changed a line. Your rarity stayed 10.00 bits (1 in 1,000 by chance). Points on this line 20.00 → 25.00, because the others want this line more now: your 10.00 bits × others' 2.50 bits = 25.00 points (others' bits were 2.00).");
  // Less rare, yet the others want it more (only that explains the rise): 10 × 2 = 20, 9 × 3 = 27.
  assert.equal(pointsCause(snap(10, 2, 20), snap(9, 3, 27)), "the others want this line more now");
  // Both fell: 30 × 4 = 120, 25 × 3 = 75.
  assert.equal(pointsCause(snap(30, 4, 120), snap(25, 3, 75)), "the others want this line less now and this line is less rare by your rule now");
});

test("against your rarity with figures that explain nothing: the rule is said, never a guessed cause", () => {
  // Rarer, points fell, the others unchanged: the snapshot's figures do not explain it (10.5 × 4 = 42, not 40).
  assert.equal(moveSentence({ who, before: snap(10, 4, 50), after: snap(10.5, 4, 40) }),
    "Your agent Tank-1 changed a line. Your rarity 10.00 → 10.50 bits: 1 in 1,000 → 1 in 1,400 by chance. Points on this line 50.00 → 40.00: your 10.50 bits × others' 4.00 bits = 42.00 points. A line's points are your bits × the others' bits.");
});

test("both moving the same way needs no reason; a line with no points says why", () => {
  // 3.25 × 4 = 13; 2^5 = 32, 2^3.25 = 9.5.
  assert.equal(moveSentence({ who, before: snap(5, 4, 20), after: snap(3.25, 4, 13) }),
    "Your agent Tank-1 changed a line. Your rarity 5.00 → 3.25 bits: 1 in 32 → 1 in 9.5 by chance. Points on this line 20.00 → 13.00: your 3.25 bits × others' 4.00 bits = 13.00 points.");
  // Others' bits 0: only you care. 2^2 = 4, 2^2.5 = 5.7.
  assert.equal(moveSentence({ who, before: snap(2, 0, 0), after: snap(2.5, 0, 0) }),
    "Your agent Tank-1 changed a line. Your rarity 2.00 → 2.50 bits: 1 in 4 → 1 in 5.7 by chance. No points on this line yet: your 2.50 bits × others' 0.00 bits = 0.00 points. Only you care about this line, so it scores nothing yet: it needs someone else to find it rare too.");
  // Not rare by your rule on either side: no rarity part.
  assert.equal(moveSentence({ who, before: snap(0, 3.2, 0, false), after: snap(0, 3.2, 0) }),
    "Your agent Tank-1 changed a line. No points on this line yet: your 0.00 bits × others' 3.20 bits = 0.00 points. It is not rare by your rule yet.");
});

test("your rarity in words: bits with their chance, or stayed", () => {
  assert.equal(rarityText(9, 9), "Your rarity stayed 9.00 bits (1 in 512 by chance)");
  assert.equal(rarityText(30, 9), "Your rarity 30.00 → 9.00 bits: 1 in 1.1 billion → 1 in 512 by chance");
});

test("who moved it: the viewer's own agent by name, or another player, unnamed", () => {
  assert.equal(moveWho({ mine: true, agentId: "a1" }, "Tank-1"), "Your agent Tank-1");
  assert.equal(moveWho({ mine: true, agentId: "a1" }, undefined), "Your agent", "a destroyed agent has no row to name it");
  // Another player's move names no one, not even that an agent made it (v1's public log: no attribution while live).
  assert.equal(moveWho({ mine: false, agentId: null }), "Another player");
  // 3.4 × 2.4 = 8.16.
  assert.equal(moveSentence({ who: moveWho({ mine: false, agentId: null }), before: snap(6.8, 2.4, 16.32), after: snap(3.4, 2.4, 8.16) }),
    "Another player changed a line. Your rarity 6.80 → 3.40 bits: 1 in 111 → 1 in 11 by chance. Points on this line 16.32 → 8.16: your 3.40 bits × others' 2.40 bits = 8.16 points.");
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
    moveSentence({ who, change, before: snap(3.4, 2.4, 8.16), after: snap(6.8, 2.1, 14.28) }),
    moveSentence({ who, before: snap(10, 4, 50), after: snap(10.5, 4, 40) }),
    moveSentence({ who, before: snap(2, 0, 0), after: snap(2.5, 0, 0) }),
  ];
  for (const l of lines) assert.doesNotMatch(l, /\b(grid|object|payoff)s?\b|✨/i);
});
