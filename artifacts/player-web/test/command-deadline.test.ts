/**
 * The forge's deadline on Validate and Summon (src/core/game/command-deadline.ts): a congested sandbox ends in a
 * visible, retryable error rather than an endless "Validating", and an answer that arrives after its attempt was given
 * up, or after a newer attempt began, changes nothing. Time is a hand-driven timer, so no test sleeps.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMINATION_DEADLINE_MS } from "@workspace/player-client";
import { BUSY_ATTEMPTS, COMMAND_DEADLINE_MS, busyMessage, isBusy, progressLine, createAttempts, deadlineFor, destroyedText, headerNotice, receiptNotice, type Timers } from "../src/core/game/command-deadline.ts";

/** Timers fired by hand, in the order of their deadlines. */
function manualTimers() {
  let now = 0, next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set(fn, ms) { const id = next++; pending.set(id, { at: now + ms, fn }); return id; },
    clear(id) { pending.delete(id as number); },
  };
  return {
    timers, pending,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending].sort((a, b) => a[1].at - b[1].at)) if (t.at <= now) { pending.delete(id); t.fn(); }
    },
  };
}
/** A request the test answers when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("the client waits a little longer than the engine's own examination bound, so the engine's answer comes first", () => {
  assert.equal(EXAMINATION_DEADLINE_MS, 20_000);
  assert.equal(COMMAND_DEADLINE_MS, 25_000);
  assert.equal(deadlineFor("validate"), 25_000);
  assert.equal(deadlineFor("summon"), 25_000);
  // Commands that never touch the sandbox answer in one mutation: no deadline of ours.
  for (const type of ["chat", "destroy", "ready", "pause", "allocatePower"]) assert.equal(deadlineFor(type), null, type);
});

test("the message names what was slow, for how long, and that it can be tried again", () => {
  assert.doesNotMatch(busyMessage("validate"), /\d|command|sandbox/, "no number to disagree with the engine's, no jargon");
  assert.match(busyMessage("summon"), /not summoned and nothing was spent/);
});

test("an answer inside the deadline is the outcome, and its timer is cancelled", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const request = deferred<string>();
  const outcome = attempts.run(() => request.promise, 25_000);
  clock.advance(24_999);
  request.resolve("receipt");
  assert.deepEqual(await outcome, { status: "done", value: "receipt" });
  assert.equal(clock.pending.size, 0, "no timer is left running");
});

test("a request still unanswered at the deadline times out; its late answer is never seen", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const request = deferred<string>();
  const outcome = attempts.run(() => request.promise, 25_000);
  let settled = 0;
  void outcome.then(() => { settled++; });
  clock.advance(24_999);
  await Promise.resolve();
  assert.equal(settled, 0, "not before the deadline");
  clock.advance(1);
  assert.deepEqual(await outcome, { status: "timeout" });
  request.resolve("late receipt");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await outcome, { status: "timeout" }, "the late answer does not replace the timeout");
  assert.equal(settled, 1);
});

test("a late failure of a timed-out request is swallowed (no unhandled rejection), and the retry is judged on its own", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const first = deferred<string>(), second = deferred<string>();
  const a = attempts.run(() => first.promise, 25_000);
  clock.advance(25_000);
  assert.deepEqual(await a, { status: "timeout" });
  const b = attempts.run(() => second.promise, 25_000);
  first.reject(new Error("connection lost"));
  await new Promise(resolve => setImmediate(resolve));
  second.resolve("fresh receipt");
  assert.deepEqual(await b, { status: "done", value: "fresh receipt" });
});

test("a failure inside the deadline is reported with its error", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const error = new Error("UNAVAILABLE");
  assert.deepEqual(await attempts.run(() => Promise.reject(error), 25_000), { status: "failed", error });
  assert.deepEqual(await attempts.run(() => { throw error; }, 25_000), { status: "failed", error }, "a synchronous throw too");
  assert.equal(clock.pending.size, 0);
});

test("an older attempt that answers, fails or times out after a newer one began is stale", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const old = deferred<string>(), failing = deferred<string>(), slow = deferred<string>(), newest = deferred<string>();
  const a = attempts.run(() => old.promise, 25_000);
  const b = attempts.run(() => failing.promise, 25_000);
  const c = attempts.run(() => slow.promise, 10_000);
  const d = attempts.run(() => newest.promise, 25_000);
  old.resolve("old receipt");
  failing.reject(new Error("old failure"));
  clock.advance(10_000);
  assert.deepEqual(await a, { status: "stale" });
  assert.deepEqual(await b, { status: "stale" });
  assert.deepEqual(await c, { status: "stale" });
  newest.resolve("newest receipt");
  assert.deepEqual(await d, { status: "done", value: "newest receipt" });
});

test("a command without a deadline waits as long as it takes", async () => {
  const clock = manualTimers(), attempts = createAttempts(clock.timers);
  const request = deferred<string>();
  const outcome = attempts.run(() => request.promise, null);
  assert.equal(clock.pending.size, 0);
  clock.advance(600_000);
  request.resolve("receipt");
  assert.deepEqual(await outcome, { status: "done", value: "receipt" });
});

test("the waiting line counts the seconds after two, and says which try it is", () => {
  assert.equal(progressLine("validate", null, 1_900), "Checking your agent… this can take up to 20 seconds.");
  assert.equal(progressLine("validate", null, 6_400), "Checking your agent… 6 s (this can take up to 20 seconds).");
  assert.equal(progressLine("summon", null, 500), "Summoning…");
  assert.equal(progressLine("summon", null, 3_000), "Summoning… 3 s");
  assert.equal(progressLine("summon", { attempt: 2, of: 3 }, 9_200), "The game is busy checking agents. Trying again (2 of 3)… 9 s");
  assert.equal(progressLine("validate"), "Checking your agent… this can take up to 20 seconds.", "no clock: as before");
});

test("the forge shows the engine's own answer: a warming sandbox and a refusal are said, a diagnosed validation is not repeated", () => {
  const commandId = "c";
  // The typed "not ready" answer (engine commands.ts): nothing was examined; the sentence is the engine's.
  assert.deepEqual(receiptNotice("validate", { commandId, accepted: false, message: "The Python sandbox is warming up; try again in a moment.",
    notReady: { language: "python", state: "warming", retryAfterMs: 1500 } }),
    { ok: false, text: "The Python sandbox is warming up; try again in a moment." });
  assert.deepEqual(receiptNotice("summon", { commandId, accepted: false, message: "Not enough energy" }), { ok: false, text: "Not enough energy" });
  assert.equal(receiptNotice("summon", { commandId, accepted: true, message: "" }), null, "the forge's own 'Summoned: …' line says it; never a bare 'Accepted.' beside it");
  assert.deepEqual(receiptNotice("summon", { commandId, accepted: true, message: "Summoned for 178 energy" }), { ok: true, text: "Summoned for 178 energy" });
  // Under the header: what happened, never a bare "Accepted." after a destroy.
  assert.equal(headerNotice("destroy", { accepted: true, message: "" }, destroyedText("Simple spread keeper")), "Destroyed: Simple spread keeper. Its power share is yours again.");
  assert.equal(headerNotice("destroy", { accepted: true, message: "" }), "Destroyed. Its power share is yours again.");
  assert.equal(destroyedText(" "), "Destroyed: your agent. Its power share is yours again.");
  assert.equal(headerNotice("destroy", { accepted: false, message: "No such agent" }, destroyedText("X")), "No such agent", "a refusal is the engine's sentence");
  assert.equal(headerNotice("look", { accepted: true, message: "Looked at 14 objects for 23.25 energy" }), "Looked at 14 objects for 23.25 energy");
  assert.equal(headerNotice("ready", { accepted: true, message: "" }), "Accepted.");
  assert.deepEqual(receiptNotice("summon", { commandId, accepted: false, message: "" }), { ok: false, text: "Rejected." });
  // Its diagnostics are listed in the forge's validation box already.
  assert.equal(receiptNotice("validate", { commandId, accepted: true, message: "Invalid", validation: { valid: false, cost: 0, expectedActCost: 0, diagnostics: ["SyntaxError"] } }), null);
  assert.deepEqual(receiptNotice("validate", { commandId, accepted: true, message: "Valid", validation: { valid: true, cost: 1, expectedActCost: 1, diagnostics: [] } }), { ok: true, text: "Valid" });
});

test("a busy sandbox is retried by itself: a timeout or the engine's UNAVAILABLE, never a refusal or another error", () => {
  assert.ok(isBusy({ status: "timeout" }));
  assert.ok(isBusy({ status: "failed", error: { data: { code: "UNAVAILABLE", message: "The agent sandbox is busy" } } }));
  assert.ok(!isBusy({ status: "failed", error: new Error("network") }));
  assert.ok(!isBusy({ status: "failed", error: { data: { code: "CONFLICT" } } }));
  assert.ok(!isBusy({ status: "done" }));
  assert.equal(BUSY_ATTEMPTS, 4);
});

test("the waiting line is plain: what is happening, then which try this is", () => {
  assert.equal(progressLine("validate"), "Checking your agent… this can take up to 20 seconds.");
  assert.equal(progressLine("summon", { attempt: 1, of: 4 }), "Summoning…");
  assert.equal(progressLine("summon", { attempt: 2, of: 4 }), "The game is busy checking agents. Trying again (2 of 4)…");
});
