/**
 * The game timer's display (the arithmetic is game-core's game-timer.ts): one prominent line at the top of a live
 * game, in the dock and on the game page. `role="timer"` with aria-live off: a screen reader reads it on request, it is
 * never announced every second. No JSX, so node's test runner can render it.
 */
import { createElement } from "react";
import { formatClock, type GameTimer } from "@workspace/game-core";

export interface TimerText { label: string; value: string; note: string; paused: boolean; tip: string }

export function timerText(t: GameTimer): TimerText {
  const paused = (t.kind === "fixed" || t.kind === "halfLife") && t.paused;
  switch (t.kind) {
    case "ended":
      // Never mistaken for a stall: an ended game says so, with the clock at zero when its time ran out.
      return t.reason === "owner"
        ? { label: "Game over", value: "ended", note: `the owner ended it at ${formatClock(t.world, "down")}`, paused: false, tip: "The room's owner ended this game. Nothing changes any more: open the replay to watch it again." }
        : { label: "Game over", value: "0:00", note: t.reason === "lifetime" ? `time is up (${formatClock(t.world, "down")} of world time)` : "ended", paused: false,
          tip: "This game reached the end of its lifetime. Nothing changes any more: open the replay to watch it again." };
    case "planning":
      return t.held
        ? { label: "Planning", value: "waiting", note: "agent sandboxes are warming up", paused: false, tip: "Planning is over; the world starts as soon as every agent sandbox is ready." }
        : { label: "World starts in", value: formatClock(t.seconds), note: "", paused: false, tip: "The game clock starts when planning ends." };
    case "fixed":
      return { label: "Game ends in", value: formatClock(t.seconds), note: paused ? "paused" : "", paused,
        tip: "A fixed-length game: it ends after exactly this much more world time. World time runs with the clock while the world runs and stands still while paused." };
    case "halfLife": {
      const h = formatClock(t.halfLifeSeconds);
      return { label: "Game ends in", value: `${formatClock(t.lo, "down")}–${formatClock(t.hi)}`, note: paused ? "paused · 90%" : "90%", paused,
        tip: `Each moment the game has the same chance of ending (half-life ${h}), so how long it has run tells you nothing: the time left is, with 90% confidence, within this range, and the range does not narrow.` };
    }
  }
}

export function GameTimerView({ timer }: { timer: GameTimer | null }) {
  if (!timer) return null;
  const x = timerText(timer);
  return createElement("div", {
    role: "timer", "aria-live": "off", "data-testid": "game-timer", "data-paused": x.paused ? "true" : undefined, title: x.tip,
    "aria-label": `${x.label} ${x.value}${x.note ? `, ${x.note}` : ""}. ${x.tip}`,
    // Opaque and above the panes that scroll beneath it (a soft shadow marks the edge), so nothing reads as part of the bar.
    className: "relative z-30 flex flex-wrap items-baseline justify-center gap-x-2 border-b border-[hsl(var(--card-border))] bg-[hsl(var(--muted))] px-3 py-1.5 font-mono shadow-[0_2px_6px_rgba(0,0,0,0.08)]",
  },
  createElement("span", { className: "label-mono text-xs text-muted-foreground" }, x.label),
  createElement("span", { className: `text-2xl font-semibold tabular-nums sm:text-3xl ${x.paused ? "opacity-60" : ""}`, "data-testid": "game-timer-value" }, x.value),
  x.note ? createElement("span", { className: "text-xs text-muted-foreground" }, x.note) : null);
}
