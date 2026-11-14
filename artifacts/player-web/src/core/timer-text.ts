/** The game clock's words (game-timer.tsx), pure so it is unit tested. */
import type { Header } from "../sdk/types.ts";
import { clock } from "./words.ts";

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
        const { lo, hi } = halfLifeInterval90(h.worldSeconds);
        return { label: "Game ends in", value: `${clock(Math.floor(lo))}–${clock(Math.ceil(hi))}`, note: "90%",
          tip: `Each moment the game has the same chance of ending (half-life ${clock(h.worldSeconds)}), so how long it has run tells you nothing: the time left is, with 90% confidence, within this range, and the range does not narrow.` };
      }
      const left = h.endsAt ? Math.max(0, (h.endsAt - now) / 1000) : h.worldSeconds;
      // Well past the end and still running: the server has not finished the game (round 9: "0:00" forever, silent).
      if (h.endsAt && now - h.endsAt > OVERDUE_MS) {
        return { label: "Game ends in", value: "0:00", note: "the game should have ended: waiting for the server to finish it", tip: "The world's time is up but the server has not finished the game yet. If this lasts, reload the page or tell the room's owner." };
      }
      return { label: "Game ends in", value: clock(Math.ceil(left)), note: "", tip: "A fixed-length game: it ends after exactly this much more world time." };
    }
    // World time stands still while paused: no countdown (the end moves out by the pause's length).
    case "paused": return { label: "Game", value: "paused", note: "", tip: "World time stands still while the game is paused." };
    case "ended": return { label: "Game over", value: "0:00", note: "", tip: "This game has ended. Nothing changes any more." };
  }
}

