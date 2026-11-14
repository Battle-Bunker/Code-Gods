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
  const h = (now: number) => timerText({ phase: "live", endsAt: null, durationMode: "halfLife", worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 } as never, now)!;
  // τ = 300 / ln 2; [τ·ln(1/0.95), τ·ln(1/0.05)] = [22.2, 1296.6] s.
  assert.deepEqual([h(0).label, h(0).value, h(0).note], ["Game ends in", "0:22–21:37", "90%"]);
  assert.equal(h(600_000).value, h(0).value, "how long it has run tells you nothing");
  assert.match(h(0).tip, /same chance of ending .*half-life 5:00/);
  assert.doesNotMatch(h(0).tip, /exactly/);
});

test("only a fixed game has a length to count time left against (a half-life game's end is hidden)", async () => {
  const { fixedLength } = await import("../src/core/timer-text.ts");
  assert.equal(fixedLength({ durationMode: "fixed", worldSeconds: 300 }), 300);
  assert.equal(fixedLength({ durationMode: "halfLife", worldSeconds: 300 }), null);
});
