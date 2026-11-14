/** The dock's planning line (src/core/planning-line.ts): what planning is for, one countdown, and who may start early. */
import test from "node:test";
import assert from "node:assert/strict";
import { planningLine } from "../src/core/planning-line.ts";

const at = 1_000_000, ends = at + 61_500;

test("planning says what it is for and when the world starts; only the owner gets Start the world now", () => {
  // Catches: "Boring. Is it broken?" (a countdown with no purpose), or the owner's early start hidden in the palette.
  assert.deepEqual(planningLine({ phase: "planning", seated: true, owner: true, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: summon your first agent. The world starts in 1:02.", startNow: true, summon: false });
  assert.deepEqual(planningLine({ phase: "planning", seated: true, owner: false, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: summon your first agent. The world starts in 1:02. The owner can start early.", startNow: false, summon: false });
  // A spectator has no agent to summon; a spectating owner may still start the world.
  assert.deepEqual(planningLine({ phase: "planning", seated: false, owner: true, planningEndsAt: ends, nowMs: at }),
    { text: "Planning: the players are writing their first agents. The world starts in 1:02.", startNow: true, summon: false });
});

test("no line outside planning or once the countdown is over (nothing left to start early)", () => {
  assert.equal(planningLine({ phase: "live", seated: true, owner: true, planningEndsAt: ends, nowMs: at }), null);
  assert.equal(planningLine({ phase: "planning", seated: true, owner: true, planningEndsAt: at, nowMs: at }), null, "held for the sandboxes: the timer says so");
  assert.equal(planningLine({ phase: "planning", seated: true, owner: true, nowMs: at }), null);
  assert.equal(planningLine({ phase: "planning", seated: true, owner: false, planningEndsAt: at + 400, nowMs: at })?.text, "Planning: summon your first agent. The world starts in 0:01. The owner can start early.");
});

test("a seated player with no agent gets the Summon my first agent button, in planning and once the world runs", () => {
  const at = 1_000_000;
  const planning = { phase: "planning", seated: true, owner: true, planningEndsAt: at + 62_000, nowMs: at };
  assert.deepEqual(planningLine({ ...planning, agents: 0 }), { text: "Planning: summon your first agent. The world starts in 1:02.", startNow: true, summon: true });
  assert.equal(planningLine({ ...planning, agents: undefined })?.summon, false, "agents still loading is not no agents");
  assert.deepEqual(planningLine({ ...planning, agents: 1 }), { text: "Planning: your agent is ready. The world starts in 1:02.", startNow: true, summon: false });
  assert.equal(planningLine({ ...planning, agents: 0, canSummon: false })?.summon, false, "view only");
  assert.equal(planningLine({ ...planning, agents: 0, seated: false })?.summon, false, "a spectator");
  assert.deepEqual(planningLine({ phase: "live", seated: true, owner: false, nowMs: at, agents: 0 }),
    { text: "You have no agent yet. Summon one to start scoring.", startNow: false, summon: true });
  assert.equal(planningLine({ phase: "live", seated: true, owner: false, nowMs: at, agents: 2 }), null);
  assert.equal(planningLine({ phase: "live", seated: true, owner: false, nowMs: at }), null, "not known yet");
  assert.equal(planningLine({ phase: "live", seated: false, owner: false, nowMs: at, agents: 0 }), null);
});
