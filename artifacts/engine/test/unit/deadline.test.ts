/**
 * The bound on a player's agent examination (convex/lib/deadline.ts): pure, no backend. A validate or summon whose
 * sandbox work does not finish in time ends in one clear sentence instead of holding the caller (the forge, the
 * assistant's validate_agent) until the action dies. Deadlines here are a few milliseconds of real time.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DeadlineExceeded, examinationBusyMessage, within } from "../../convex/lib/deadline.ts";

const never = new Promise<never>(() => {});

test("work that finishes in time is returned, and no timer keeps the process alive", async () => {
  assert.equal(await within(Promise.resolve("examined"), 60_000), "examined");
  // If the 60 s timer were left running, this test file would not exit for a minute: `node --test` would show it.
});

test("work that fails in time fails with its own error", async () => {
  const fault = new Error("SyntaxError: line 1");
  await assert.rejects(within(Promise.reject(fault), 60_000), error => error === fault);
});

test("work still running at the deadline is given up with DeadlineExceeded", async () => {
  const started = performance.now();
  await assert.rejects(within(never, 20), error => error instanceof DeadlineExceeded && error.ms === 20);
  assert.ok(performance.now() - started >= 15, "not before the deadline");
});

test("work that fails after it was given up does not raise an unhandled rejection", async () => {
  let fail!: (error: Error) => void;
  const late = new Promise<string>((_, reject) => { fail = reject; });
  await assert.rejects(within(late, 5), DeadlineExceeded);
  fail(new Error("Queue wait expired"));
  // node --test fails the file on an unhandled rejection; give it a turn to surface.
  await new Promise(resolve => setImmediate(resolve));
});

test("the sentence says what was slow, for how long, that nothing was applied and what to do", () => {
  assert.equal(examinationBusyMessage("validate", 20_000),
    "The agent sandbox is busy: validating this agent took longer than 20 seconds, so nothing was validated. Send the same command again in a moment.");
  assert.equal(examinationBusyMessage("summon", 20_000),
    "The agent sandbox is busy: examining this agent took longer than 20 seconds, so nothing was summoned or paid. Send the same command again in a moment.");
});
