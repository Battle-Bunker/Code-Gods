/**
 * The overview's next step (src/core/panels/next-step.ts) while a start is pending: the owner's "Start the game" turns
 * into a busy "Starting the game…" the moment it is clicked, then into the preparation's progress, never a second start.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep, type NextStepContext } from "../src/core/panels/next-step.ts";

const owner: NextStepContext = { phase: "lobby", seated: false, isOwner: true, members: 3, agents: 0 };

test("an owner with three players gets Start the game, not busy", () => {
  const s = nextStep(owner);
  assert.equal(s.label, "Start the game");
  assert.equal(s.action.kind, "start");
  assert.ok(!s.busy);
});

test("starting: the same button, busy, saying so (the action cannot run twice)", () => {
  const s = nextStep({ ...owner, start: { phase: "starting", source: "owner" } });
  assert.equal(s.label, "Starting the game…");
  assert.equal(s.busy, true);
  const viaAssistant = nextStep({ ...owner, start: { phase: "starting", source: "assistant" } });
  assert.match(viaAssistant.why, /assistant/);
  assert.equal(viaAssistant.busy, true);
});

test("preparing: busy with the tables' honest progress, for the owner; others keep their own step", () => {
  const s = nextStep({ ...owner, start: { phase: "preparing", ready: 3, total: 8 } });
  assert.equal(s.label, "Preparing the game…");
  assert.match(s.why, /3 of 8/);
  assert.equal(s.busy, true);
  const guest = nextStep({ ...owner, isOwner: false, start: { phase: "preparing", ready: 3, total: 8 } });
  assert.equal(guest.label, "Read how to play");
  assert.ok(!guest.busy);
});

test("a pending start does not change the step once the game is live", () => {
  const s = nextStep({ ...owner, phase: "planning", seated: true, start: { phase: "starting", source: "owner" } });
  assert.equal(s.label, "Write your first agent");
  assert.ok(!s.busy);
});
