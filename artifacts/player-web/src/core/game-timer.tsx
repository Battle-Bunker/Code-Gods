/**
 * The game's one prominent clock (under the header): the countdown to the world's start in planning, the time left
 * while the world runs (fixed length, ux-lessons 1.6), "paused", or "Game over". Read from the cold game header and
 * the browser's clock (no clock subscription: the clocks table is hot and private to the engine).
 */
import { useEffect, useState } from "react";
import type { Header } from "@/sdk/types";
import { clock } from "./words";

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function timerText(h: Header, now: number): { label: string; value: string; note: string; tip: string } {
  switch (h.phase) {
    case "planning": {
      const left = h.planningEndsAt ? (h.planningEndsAt - now) / 1000 : h.planningSeconds;
      return left > 0 ? { label: "World starts in", value: clock(Math.ceil(left)), note: "", tip: "The game clock starts when planning ends." }
        : { label: "Planning", value: "starting", note: "the world starts in a moment", tip: "Planning is over; the world starts as soon as the engine is ready." };
    }
    case "live": {
      const left = h.endsAt ? Math.max(0, (h.endsAt - now) / 1000) : h.worldSeconds;
      return { label: "Game ends in", value: clock(Math.ceil(left)), note: "", tip: "A fixed-length game: it ends after exactly this much more world time." };
    }
    case "paused": return { label: "Game ends in", value: h.endsAt ? clock(Math.ceil(Math.max(0, (h.endsAt - now) / 1000))) : "—", note: "paused", tip: "World time stands still while the game is paused." };
    case "ended": return { label: "Game over", value: "0:00", note: "", tip: "This game has ended. Nothing changes any more." };
  }
}

export function GameTimer({ header }: { header: Header }) {
  const now = useNow();
  const x = timerText(header, now);
  return (
    <div role="timer" aria-live="off" data-testid="game-timer" data-paused={header.phase === "paused" || undefined} title={x.tip}
      aria-label={`${x.label} ${x.value}${x.note ? `, ${x.note}` : ""}. ${x.tip}`}
      className="relative z-30 flex flex-wrap items-baseline justify-center gap-x-2 border-b border-[hsl(var(--card-border))] bg-[hsl(var(--muted))] px-3 py-1.5 font-mono shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
      <span className="label-mono text-xs text-muted-foreground">{x.label}</span>
      <span className={`text-2xl font-semibold tabular-nums sm:text-3xl ${header.phase === "paused" ? "opacity-60" : ""}`} data-testid="game-timer-value">{x.value}</span>
      {x.note && <span className="text-xs text-muted-foreground">{x.note}</span>}
    </div>
  );
}
