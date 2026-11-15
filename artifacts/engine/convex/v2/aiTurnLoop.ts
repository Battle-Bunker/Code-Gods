/**
 * An AI seat's turn loop, without Convex (aiTurn.ts supplies the reads, the model run and the scheduler): whatever one
 * turn throws, the next turn is scheduled, so a failed query never stops an AI player for the rest of its game.
 */
import { OpFailure } from "@workspace/v2-affordances";

export type TurnIo<S extends { phase: string; parked: boolean; timeScale: number }> = {
  seat: () => Promise<S | null>;
  play: (seat: S) => Promise<void>;
  schedule: (n: number, ms: number) => Promise<unknown>;
  log: { warn: (m: string) => void; error: (m: string) => void };
};

/** Turn `n` (0-based) of at most `maxTurns`, the next one `turnMs / timeScale` later. */
export async function takeTurn<S extends { phase: string; parked: boolean; timeScale: number }>(io: TurnIo<S>, n: number, turnMs: number, maxTurns: number): Promise<void> {
  let seat: S | null;
  // The seat could not be read (a timed-out query): ask again a turn later, uncounted.
  try { seat = await io.seat(); } catch (e) { io.log.error(`v2 AI turn could not read its seat: ${(e as Error).message}`); await io.schedule(n, turnMs); return; }
  // An idle-parked game takes no AI turns (activity.ts); the next human activity starts them again.
  if (!seat || seat.phase === "ended" || seat.parked) return;
  const schedule = (k: number) => k < maxTurns ? io.schedule(k, turnMs / seat.timeScale) : null;
  if (seat.phase === "paused") { await schedule(n); return; }   // a paused turn does not count
  try { await io.play(seat); } catch (e) {
    // Refused before any call (a quota, a ceiling, the rate limit, no model, not an administrator's room): the seat
    // waits and asks again next turn, uncounted, since the owner may raise a quota mid-game. A failure is logged.
    if (e instanceof OpFailure) { io.log.warn(`waits: ${e.message}`); await schedule(n); return; }
    io.log.error(`v2 AI turn failed: ${(e as Error).message}`);
  }
  await schedule(n + 1);
}
