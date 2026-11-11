/** The dock's planning line (src/core/planning-line.ts): what planning is for, one countdown, and who may start early. */
import test from "node:test";
import assert from "node:assert/strict";
import { planningLine } from "../src/core/planning-line.ts";

const at = 1_000_000, ends = at + 61_500;

test("planning says what it is for and when the world starts; only the owner gets Start the world now", () => {
  // Catches: "Boring. Is it broken?" (a countdown with no purpose), or the owner's early start hidden in the palette.
  assert.deepEqual(planningLine({ phase: "planning", seated: true, owner: true, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: summon your first agent. The world starts in 1:02.", startNow: true });
  assert.deepEqual(planningLine({ phase: "planning", seated: true, owner: false, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: summon your first agent. The world starts in 1:02. The owner can start early.", startNow: false });
  // A spectator has no agent to summon; a spectating owner may still start the world.
  assert.deepEqual(planningLine({ phase: "planning", seated: false, owner: true, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: the players are writing their first agents. The world starts in 1:02.", startNow: true });
});

test("no line outside planning or once the countdown is over (nothing left to start early)", () => {
  assert.equal(planningLine({ phase: "running", seated: true, owner: true, planningEndsAt: ends, nowMs: at }), null);
  assert.equal(planningLine({ phase: "planning", seated: true, owner: true, planningEndsAt: at, nowMs: at }), null, "held for the sandboxes: the timer says so");
  assert.equal(planningLine({ phase: "planning", seated: true, owner: true, nowMs: at }), null);
  assert.equal(planningLine({ phase: "planning", seated: true, owner: false, planningEndsAt: at + 400, nowMs: at })?.text, "Planning: summon your first agent. The world starts in 0:01. The owner can start early.");
});
