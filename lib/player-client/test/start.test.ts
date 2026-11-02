/**
 * The pending start (src/start.ts): what a "Start the game" control shows from the click until the room's subscription
 * shows the game (or its preparation), and that a pending start can never stick.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { START_LAG_MS, START_TIMEOUT_MS, createStartTracker, startView, trackStart, type StartRoom } from "../src/start.ts";

const lobby: StartRoom = { activeGame: null, preparing: null };
const live: StartRoom = { activeGame: { shortCode: "G1" }, preparing: null };
const preparing: StartRoom = { activeGame: null, preparing: { ready: 3, total: 8 } };
const failedPrep: StartRoom = { activeGame: null, preparing: { ready: 3, total: 8, error: "boom" } };

/** A manual clock: `later` callbacks run when `advance` passes their time. */
function fakeClock() {
  let t = 1_000;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => t,
    later: (fn: () => void, ms: number) => { timers.push({ at: t + ms, fn }); },
    advance(ms: number) { t += ms; for (const x of timers.splice(0).sort((a, b) => a.at - b.at)) { if (x.at <= t) x.fn(); else timers.push(x); } },
  };
}

test("no request: idle in the lobby, preparing while the room prepares, idle once the game is live or the preparation failed", () => {
  assert.deepEqual(startView(null, lobby, 0), { phase: "idle" });
  assert.deepEqual(startView(null, preparing, 0), { phase: "preparing", ready: 3, total: 8 });
  assert.deepEqual(startView(null, live, 0), { phase: "idle" });
  assert.deepEqual(startView(null, failedPrep, 0), { phase: "idle" }, "a failed preparation gives the control back (the error shows beside it)");
});

test("a request in flight shows starting at once, then the room's own state wins", () => {
  const req = { requestId: "r", since: 100, source: "owner" as const };
  assert.deepEqual(startView(req, lobby, 100), { phase: "starting", source: "owner" }, "the same frame as the click");
  assert.deepEqual(startView(req, failedPrep, 150), { phase: "starting", source: "owner" }, "a retry after a failed preparation is starting, not the old error");
  assert.deepEqual(startView(req, preparing, 150), { phase: "preparing", ready: 3, total: 8 }, "straight to the honest progress");
  assert.deepEqual(startView(req, live, 150), { phase: "idle" }, "the game is live: nothing pending");
});

test("a stale request cannot stick: the subscription lagging after the call returned, or a call that never settles", () => {
  const returned = { requestId: "r", since: 100, source: "owner" as const, returnedAt: 200 };
  assert.equal(startView(returned, lobby, 200 + START_LAG_MS - 1).phase, "starting", "the call returned; the room has not caught up yet");
  assert.equal(startView(returned, lobby, 200 + START_LAG_MS).phase, "idle", "the lag is over: the room is the truth");
  const hung = { requestId: "r", since: 100, source: "owner" as const };
  assert.equal(startView(hung, lobby, 100 + START_TIMEOUT_MS - 1).phase, "starting");
  assert.equal(startView(hung, lobby, 100 + START_TIMEOUT_MS).phase, "idle");
});

test("the tracker refuses a second start while one is live, re-renders when a request goes stale, and forgets a failed one", () => {
  const clock = fakeClock();
  const tracker = createStartTracker(clock);
  let emits = 0;
  tracker.subscribe(() => { emits++; });
  const id = tracker.begin("room1", "owner");
  assert.ok(id, "the first click starts");
  assert.equal(tracker.begin("room1", "owner"), null, "a double click does not send a second start");
  assert.ok(tracker.begin("room2", "owner"), "another room is independent");
  assert.equal(tracker.get("room1")?.requestId, id);

  tracker.returned("room1", id!);
  assert.equal(tracker.get("room1")?.returnedAt, clock.now());
  const before = emits;
  clock.advance(START_LAG_MS);
  assert.ok(emits > before, "listeners re-render when the lag runs out");
  assert.equal(startView(tracker.get("room1"), lobby, clock.now()).phase, "idle");
  assert.ok(tracker.begin("room1", "owner"), "and the control works again");

  const again = tracker.get("room1")!.requestId;
  tracker.failed("room1", "someone-else");
  assert.equal(tracker.get("room1")?.requestId, again, "a stale failure does not clear a newer request");
  tracker.failed("room1", again);
  assert.equal(tracker.get("room1"), null);
});

test("trackStart: one requestId per click, idempotent retries reuse it, failures restore the control and rethrow", async () => {
  const clock = fakeClock();
  const tracker = createStartTracker(clock);
  const seen: string[] = [];
  let resolve!: (v: string) => void;
  const pending = trackStart(tracker, "room1", id => { seen.push(id); return new Promise<string>(r => { resolve = r; }); });
  assert.equal(startView(tracker.get("room1"), lobby, clock.now()).phase, "starting", "pending before the call even resolves");
  assert.equal(await trackStart(tracker, "room1", async () => "second"), null, "blocked while pending");
  resolve("ok");
  assert.equal(await pending, "ok");
  assert.equal(seen.length, 1);
  assert.equal(seen[0], tracker.get("room1")?.requestId);
  assert.ok(tracker.get("room1")?.returnedAt !== undefined);

  const t2 = createStartTracker(fakeClock());
  await assert.rejects(trackStart(t2, "room1", async () => { throw new Error("At least three gods are required"); }), /three gods/);
  assert.equal(t2.get("room1"), null, "the control is restored");
});

test("an assistant's start_game call drives the same pending state: running starts it, ok hands over to the room, error or denial restores", () => {
  const clock = fakeClock();
  const tracker = createStartTracker(clock);
  tracker.follow("room1", "call1", "awaiting_confirmation");
  assert.equal(tracker.get("room1"), null, "nothing is starting until the owner approves");
  tracker.follow("room1", "call1", "running");
  assert.deepEqual(startView(tracker.get("room1"), lobby, clock.now()), { phase: "starting", source: "assistant" });
  tracker.follow("room1", "call1", "running");
  assert.equal(tracker.get("room1")?.since, 1_000, "a re-render does not restart the clock");
  tracker.follow("room1", "call1", "ok");
  assert.equal(tracker.get("room1")?.returnedAt, clock.now());
  clock.advance(START_LAG_MS);
  tracker.follow("room1", "call1", "ok");
  assert.equal(startView(tracker.get("room1"), lobby, clock.now()).phase, "idle", "an old finished call never revives the pending state");
  tracker.follow("room1", "call2", "awaiting_confirmation");
  tracker.follow("room1", "call2", "running");
  assert.equal(startView(tracker.get("room1"), lobby, clock.now()).phase, "starting");
  tracker.follow("room1", "call2", "error");
  assert.equal(tracker.get("room1"), null);
});

test("expiry hands React a new snapshot (useSyncExternalStore skips an unchanged one), and a call already running when first seen is not a new start", () => {
  const clock = fakeClock();
  const tracker = createStartTracker(clock);
  const id = tracker.begin("room1", "owner")!;
  tracker.returned("room1", id);
  const before = tracker.get("room1");
  clock.advance(START_LAG_MS);
  assert.notEqual(tracker.get("room1"), before, "a new object, so the hook re-renders and the control is restored");

  const t2 = createStartTracker(fakeClock());
  t2.follow("room1", "old", "running");
  assert.equal(t2.get("room1"), null, "left running by a cancelled turn, seen on a reload or remount: not a pending start");
  t2.follow("room1", "new", "pending");
  t2.follow("room1", "new", "running");
  assert.equal(t2.get("room1")?.requestId, "new");
});
