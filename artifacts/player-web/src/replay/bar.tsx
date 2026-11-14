/**
 * The replay bar (integration plan W5-5): under the game bar while a replay is open, at every width. Play and pause,
 * a step to the move before or after, the start and the end, a slider over the whole game, the speed, whose eyes it is
 * watched through, and closing it. Every control is a `replay.*` view affordance (or `view.closePane` for the
 * replay), so an assistant can drive the same replay and every client of the human follows.
 */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward, X } from "lucide-react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { REPLAY_PANE } from "@workspace/v2-client";
import { clock } from "@/core/words";
import { toast } from "@/hooks/use-toast";
import { useReplayControls } from "./controller";
import { nextStop, prevStop } from "./fold";
import { stepOp } from "./playhead";

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
type Speed = (typeof SPEEDS)[number];

const failed = (e: unknown) => toast({ title: "The replay did not move", description: e instanceof Error ? e.message : String(e), variant: "destructive" });

const btn = "inline-flex h-9 min-w-9 items-center justify-center gap-1 border border-[hsl(var(--card-border))] bg-background px-2 text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed";

export function ReplayBar() {
  const c = useReplayControls();
  const play = useAffordance("replay.play");
  const pause = useAffordance("replay.pause");
  const seek = useAffordance("replay.seek");
  const step = useAffordance("replay.step");
  const speed = useAffordance("replay.speed");
  const watchAs = useAffordance("replay.watchAs");
  const close = useAffordance("view.closePane");
  const [drag, setDrag] = useState<number | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  const commit = useRef((_seq: number) => {});
  commit.current = (seq: number) => { void seek.run({ seq }).catch(failed).finally(() => setDrag(null)); };
  // The slider writes the cursor when it is let go (the native change event), not on every pixel of a drag.
  useEffect(() => {
    const el = slider.current;
    if (!el) return;
    const onChange = () => commit.current(Number(el.value));
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, [c?.index]);
  if (!c) return null;
  const closeButton = (
    <button type="button" className={btn} onClick={() => void close.run({ pane: REPLAY_PANE }).catch(failed)} disabled={!close.available} data-testid="button-replay-close">
      <X className="h-4 w-4" aria-hidden />Close the replay
    </button>
  );
  const ix = c.index;
  if (!ix) {
    const text = c.load.status === "error" ? `The replay could not load: ${c.load.message}`
      : c.load.status === "loading" ? "Loading the replay…" : "Getting the replay ready. It takes a moment after a game ends.";
    return (
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm" data-testid="replay-bar" data-status={c.load.status}>
        <span className={`flex-1 min-w-[12rem] ${c.load.status === "error" ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-replay-status">{text}</span>
        {c.load.status === "error" && <button type="button" className={btn} onClick={c.retry} data-testid="button-replay-retry">Try again</button>}
        {closeButton}
      </div>
    );
  }
  /** A step to the move before or after stops the replay there. */
  const go = (direction: 1 | -1) => {
    if (c.playing) {
      const target = direction > 0 ? nextStop(ix, c.applied) : prevStop(ix, c.applied);
      void pause.run({}).then(() => seek.run({ seq: target })).catch(failed);
      return;
    }
    const op = stepOp(ix, c.applied, c.cursorAt, direction);
    if (op) void (op.id === "replay.step" ? step.run(op.args) : seek.run(op.args)).catch(failed);
  };
  const toggle = () => {
    // A pause stops where the playhead is (the controller writes it as the cursor).
    if (c.playing) void pause.run({}).catch(failed);
    else if (c.applied >= ix.end) {
      void seek.run({ seq: 0 }).then(() => play.run({})).catch(failed);
    } else void play.run({}).catch(failed);
  };
  const atStart = c.applied <= 0, atEnd = c.applied >= ix.end;
  const roster = ix.roster;
  return (
    <div className="space-y-2 border-b bg-[hsl(var(--muted))]/40 px-3 py-2 text-sm" data-testid="replay-bar" data-status="ready"
      data-applied={c.applied} data-end={ix.end} data-playing={c.playing || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono text-xs uppercase tracking-wide text-muted-foreground">Replay</span>
        <div className="flex items-center gap-1" role="group" aria-label="Replay controls">
          <button type="button" className={btn} aria-label="Go to the start" title="Go to the start" disabled={atStart || !seek.available}
            onClick={() => void seek.run({ seq: 0 }).catch(failed)} data-testid="button-replay-start"><SkipBack className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={btn} aria-label="Back one move" title="Back one move" disabled={atStart || !step.available}
            onClick={() => go(-1)} data-testid="button-replay-back"><StepBack className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={`${btn} px-3 font-medium`} aria-label={c.playing ? "Pause" : "Play"} disabled={!(c.playing ? pause : play).available}
            onClick={toggle} data-testid={c.playing ? "button-replay-pause" : "button-replay-play"}>
            {c.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{c.playing ? "Pause" : "Play"}
          </button>
          <button type="button" className={btn} aria-label="Forward one move" title="Forward one move" disabled={atEnd || !step.available}
            onClick={() => go(1)} data-testid="button-replay-forward"><StepForward className="h-4 w-4" aria-hidden /></button>
          <button type="button" className={btn} aria-label="Go to the end" title="Go to the end" disabled={atEnd || !seek.available}
            onClick={() => void seek.run({ seq: ix.end }).catch(failed)} data-testid="button-replay-end"><SkipForward className="h-4 w-4" aria-hidden /></button>
        </div>
        <span className="font-mono text-base font-semibold tabular-nums" data-testid="text-replay-clock" title="World time in the game, and how long the game was">
          {clock(c.world)}<span className="text-xs font-normal text-muted-foreground"> of {clock(ix.endWorld)}</span>
        </span>
      </div>
      <input ref={slider} type="range" min={0} max={ix.end} step={1} value={drag ?? c.applied} disabled={!seek.available}
        onChange={e => setDrag(Number(e.target.value))} aria-label="Move through the game" aria-valuetext={clock(c.world)}
        className="block w-full accent-[hsl(var(--primary))]" data-testid="input-replay-seek" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Speed</span>
          <select value={c.speed} disabled={!speed.available} data-testid="select-replay-speed"
            className="border border-[hsl(var(--card-border))] bg-background px-1.5 py-1"
            onChange={e => void speed.run({ speed: Number(e.target.value) as Speed }).catch(failed)}>
            {SPEEDS.map(s => <option key={s} value={s}>{s}× </option>)}
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-1.5 text-xs" title="After the game every rule is open: see the game as any player saw it.">
          <span className="text-muted-foreground">Watch as</span>
          <select value={c.member ?? ""} disabled={!watchAs.available} data-testid="select-replay-as"
            className="min-w-0 max-w-[12rem] border border-[hsl(var(--card-border))] bg-background px-1.5 py-1"
            onChange={e => void watchAs.run({ memberId: e.target.value }).catch(failed)}>
            {roster.map(m => <option key={m.memberId} value={m.memberId}>{m.name}{m.memberId === c.seat ? " (you)" : ""}</option>)}
          </select>
        </label>
        <span className="flex-1" />
        {closeButton}
      </div>
    </div>
  );
}
