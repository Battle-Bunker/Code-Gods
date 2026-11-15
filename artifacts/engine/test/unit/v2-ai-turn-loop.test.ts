/**
 * An AI seat's turn loop (convex/v2/aiTurnLoop.ts): whatever one turn throws, the seat's next turn is still scheduled,
 * so one failed query never stops an AI player for the rest of the game (found in a real Grids game).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { OpFailure } from "@workspace/v2-affordances";
import { takeTurn, type TurnIo } from "../../convex/v2/aiTurnLoop.ts";

type Seat = { phase: string; parked: boolean; timeScale: number };
const live: Seat = { phase: "live", parked: false, timeScale: 2 };
function io(over: Partial<TurnIo<Seat>>) {
  const scheduled: { n: number; ms: number }[] = [];
  const quiet = { warn: () => {}, error: () => {} };
  const base: TurnIo<Seat> = { seat: async () => live, play: async () => {}, schedule: async (n, ms) => { scheduled.push({ n, ms }); }, log: quiet };
  return { io: { ...base, ...over }, scheduled };
}

test("a turn that plays schedules the next, counted", async () => {
  const { io: t, scheduled } = io({});
  await takeTurn(t, 3, 20_000, 30);
  assert.deepEqual(scheduled, [{ n: 4, ms: 10_000 }]);
});

test("a failing query inside the turn still schedules the next turn", async () => {
  const { io: t, scheduled } = io({ play: async () => { throw new Error("Query timed out"); } });
  await takeTurn(t, 3, 20_000, 30);
  assert.deepEqual(scheduled, [{ n: 4, ms: 10_000 }]);
});

test("a failing seat read retries the same turn, uncounted", async () => {
  const { io: t, scheduled } = io({ seat: async () => { throw new Error("Query timed out"); } });
  await takeTurn(t, 3, 20_000, 30);
  assert.deepEqual(scheduled, [{ n: 3, ms: 20_000 }]);
});

test("a refusal waits uncounted; a paused game waits uncounted; an ended or parked game stops; the last turn stops", async () => {
  let r = io({ play: async () => { throw new OpFailure("quota"); } });
  await takeTurn(r.io, 3, 20_000, 30);
  assert.deepEqual(r.scheduled, [{ n: 3, ms: 10_000 }]);
  r = io({ seat: async () => ({ ...live, phase: "paused" }) });
  await takeTurn(r.io, 3, 20_000, 30);
  assert.deepEqual(r.scheduled, [{ n: 3, ms: 10_000 }]);
  for (const seat of [null, { ...live, phase: "ended" }, { ...live, parked: true }]) {
    r = io({ seat: async () => seat });
    await takeTurn(r.io, 3, 20_000, 30);
    assert.deepEqual(r.scheduled, []);
  }
  r = io({});
  await takeTurn(r.io, 29, 20_000, 30);
  assert.deepEqual(r.scheduled, []);
});
