/** The game clock's words (game-timer.tsx), pure so it is unit tested. */
import type { Header } from "../sdk/types.ts";
import { clock } from "./words.ts";
import { MIN_LIFETIME_FRACTION } from "@workspace/engine/convex/v2/duration.ts";
import { PARKED_NOTE } from "./activity.ts";

/** How long after its end a running game says the server is late. */
export const OVERDUE_MS = 15_000;

/** The central 90% of an exponential lifetime with half-life h (v1 game-timer.ts): about [0.074·h, 4.32·h]. */
export function halfLifeInterval90(halfLifeSeconds: number): { lo: number; hi: number } {
  const tau = halfLifeSeconds / Math.LN2;
  return { lo: tau * Math.log(1 / 0.95), hi: tau * Math.log(1 / 0.05) };
}

/** The game's exact length when its end is public ("fixed"), else null: a half-life game's end is hidden, never counted down to. */
export const fixedLength = (h: { durationMode?: string; worldSeconds: number }): number | null => (h.durationMode === "halfLife" ? null : h.worldSeconds);

/** null while planning counts down (the planning line under the header is the one countdown then). */
export function timerText(h: Header, now: number): { label: string; value: string; note: string; tip: string } | null {
  switch (h.phase) {
    case "planning": {
      const left = h.planningEndsAt ? (h.planningEndsAt - now) / 1000 : h.planningSeconds;
      return left > 0 ? null : { label: "Planning", value: "starting", note: "the world starts in a moment", tip: "Planning is over; the world starts as soon as the engine is ready." };
    }
    case "live": {
      if (h.durationMode === "halfLife") {
        // Memoryless: the time left has the same spread however long the game has run, so the range never narrows.
        const { hi } = halfLifeInterval90(h.worldSeconds);
        // It cannot end in its first tenth of the half-life (trial 16; public, like the half-life itself).
        const elapsed = h.startedAt != null ? Math.max(0, (now - h.startedAt) / 1000) : 0;
        const wait = Math.max(0, MIN_LIFETIME_FRACTION * h.worldSeconds - elapsed);
        const tip = `This game ends at a hidden random moment, never in its first ${clock(MIN_LIFETIME_FRACTION * h.worldSeconds)}. After that every second it has the same chance of ending, so the clock never counts down: however long it has run, 9 times in 10 it ends within the next ${clock(Math.ceil(hi))}.`;
        if (wait > 0) return { label: "Game ends", value: "not yet", note: `it cannot end for ${clock(Math.ceil(wait))}; then any moment: 9 times in 10 within the next ${clock(Math.ceil(wait + hi))}`, tip };
        return { label: "Game ends", value: "any moment", note: `at a hidden time: 9 times in 10 within the next ${clock(Math.ceil(hi))}`, tip };
      }
      const left = h.endsAt ? Math.max(0, (h.endsAt - now) / 1000) : h.worldSeconds;
      // Well past the end and still running: the server has not finished the game (round 9: "0:00" forever, silent).
      if (h.endsAt && now - h.endsAt > OVERDUE_MS) {
        return { label: "Game ends in", value: "0:00", note: "the game should have ended: waiting for the server to finish it", tip: "The world's time is up but the server has not finished the game yet. If this lasts, reload the page or tell the room's owner." };
      }
      return { label: "Game ends in", value: clock(Math.ceil(left)), note: "", tip: "A fixed-length game: it ends after exactly this much more world time." };
    }
    // World time stands still while paused: no countdown (the end moves out by the pause's length).
    case "paused": return h.parked
      ? { label: "Game", value: "paused", note: PARKED_NOTE, tip: "Nobody acted in this game for 30 minutes, so it was paused to save the engine. Any press or key resumes it; world time stood still meanwhile." }
      : { label: "Game", value: "paused", note: "", tip: "World time stands still while the game is paused." };
    case "ended": return { label: "Game over", value: "0:00", note: "", tip: "This game has ended. Nothing changes any more." };
  }
}

