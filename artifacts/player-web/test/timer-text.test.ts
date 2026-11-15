/** The game clock's words (src/core/timer-text.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERDUE_MS, timerText } from "../src/core/timer-text.ts";

const live = (endsAt: number) => ({ phase: "live", endsAt, worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 }) as never;

test("a running game counts down to its end", () => {
  assert.deepEqual([timerText(live(70_000), 0)!.label, timerText(live(70_000), 0)!.value], ["Game ends in", "1:10"]);
  assert.equal(timerText(live(1_000), 5_000)!.note, "", "just past the end: the server finishes it within a tick");
});

test("well past its end and still running, the clock says the server is late (round 9: RUNNING 0:00 forever, silent)", () => {
  const x = timerText(live(1_000), 1_000 + OVERDUE_MS + 1)!;
  assert.equal(x.value, "0:00");
  assert.match(x.note, /should have ended: waiting for the server/);
});

test("a half-life game shows v1's 90% range of the time left, which never moves; never a countdown to its hidden end", () => {
  // Started 100 s before: past the floor (h/10 = 30 s), the time left has the same spread whatever the clock says.
  const h = (now: number) => timerText({ phase: "live", endsAt: null, durationMode: "halfLife", worldSeconds: 300, startedAt: -100_000, planningEndsAt: null, planningSeconds: 60 } as never, now)!;
  // τ = 300 / ln 2; [τ·ln(1/0.95), τ·ln(1/0.05)] = [22.2, 1296.6] s.
  // In words a 12-year-old reads (round 11: "0:13–12:58 90%" looked frozen and "90%" said nothing).
  assert.deepEqual([h(0).label, h(0).value, h(0).note], ["Game ends", "any moment", "at a hidden time: 9 times in 10 within the next 21:37"]);
  assert.equal(h(600_000).note, h(0).note, "how long it has run tells you nothing");
  assert.match(h(0).tip, /same chance of ending.*so the clock never counts down/);
  assert.doesNotMatch(h(0).tip, /exactly/);
});

test("only a fixed game has a length to count time left against (a half-life game's end is hidden)", async () => {
  const { fixedLength } = await import("../src/core/timer-text.ts");
  assert.equal(fixedLength({ durationMode: "fixed", worldSeconds: 300 }), 300);
  assert.equal(fixedLength({ durationMode: "halfLife", worldSeconds: 300 }), null);
});

test("a half-life game cannot end in its first tenth of the half-life (trial 16): the clock says so, then any moment", async () => {
  const { timerText } = await import("../src/core/timer-text.ts");
  // h = 300 s: the floor is 30 s. 10 s in: it cannot end for 20 s more; 9 times in 10 within 20 s + τ·ln 20 ≈ 21:17.
  const h = (now: number) => timerText({ phase: "live", endsAt: null, durationMode: "halfLife", worldSeconds: 300, startedAt: 0, planningEndsAt: null, planningSeconds: 60 } as never, now)!;
  assert.deepEqual([h(10_000).value, h(10_000).note], ["not yet", "it cannot end for 0:20; then any moment: 9 times in 10 within the next 21:57"]);
  assert.equal(h(40_000).value, "any moment", "past the floor");
  assert.equal(h(40_000).note, "at a hidden time: 9 times in 10 within the next 21:37");
});

test("world time runs at the header's timeScale (W3 #698: a sim or local playtest may speed it up)", async () => {
  const { timerText } = await import("../src/core/timer-text.ts");
  // h = 300 s, floor 30 s. 10 s of wall time at 2× is 20 s of world time: 10 s of floor left.
  const x = timerText({ phase: "live", endsAt: null, durationMode: "halfLife", worldSeconds: 300, startedAt: 0, timeScale: 2, planningEndsAt: null, planningSeconds: 60 } as never, 10_000)!;
  assert.match(x.note, /^it cannot end for 0:10;/);
});

test("a player's pause counts down to when it resumes by itself, and says who paused (W3 #873)", () => {
  const roster = [{ memberId: "m1", name: "Bo", kind: "human" }];
  const x = timerText({ phase: "paused", pausedBy: "m1", pauseEndsAt: 161_000, roster, worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 } as never, 0)!;
  assert.deepEqual([x.label, x.value, x.note], ["Game", "paused", "Paused by Bo · resumes in 2:41"]);
  const late = timerText({ phase: "paused", pausedBy: "m1", pauseEndsAt: 1_000, roster, worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 } as never, 5_000)!;
  assert.equal(late.note, "Paused by Bo · resuming…");
});
