/**
 * The game timer's arithmetic (pure; the clock itself ticks on the client from stored timestamps).
 *
 * What ends a game (artifacts/engine/convex/engine/tick.ts): `endAtWorld`, drawn once when the game is created by
 * `gameEndSeconds` (random.ts): exactly `halfLifeSeconds` in "fixed" mode, else `-ln(U)·halfLife/ln 2` for a uniform
 * U in (0,1), a continuous exponential lifetime with mean τ = halfLife/ln 2. A tick ends the game once the world clock
 * (which stands still in planning and pauses and otherwise runs 1:1 with wall time) reaches it, so the end lands at
 * most one tick after the drawn moment: a few hundred ms, ignored here.
 *
 * The draw is made at creation, so the true remaining time is fixed but hidden. The viewer's information is that the
 * game is still alive; the exponential is memoryless, so given that, the remaining time is again exponential with the
 * same mean, whatever the elapsed time: the 90% interval below never moves.
 */
import type { DurationMode } from "./settings.ts";

/** The central 90% of an exponential lifetime with half-life `h`: [τ·ln(1/0.95), τ·ln(1/0.05)] ≈ [0.074·h, 4.32·h]. */
export function halfLifeInterval90(halfLifeSeconds: number): { lo: number; hi: number } {
  const tau = halfLifeSeconds / Math.LN2;
  return { lo: tau * Math.log(1 / 0.95), hi: tau * Math.log(1 / 0.05) };
}

/** World seconds at `nowMs`, from a world time `world` seen at `atMs`: it runs on 1:1 with wall time only while the world runs. */
export function advanceWorld(world: number, atMs: number, nowMs: number, running: boolean): number {
  return running ? world + Math.max(0, nowMs - atMs) / 1000 : world;
}

export type GameTimer =
  | { kind: "planning"; seconds: number; held: boolean }
  | { kind: "fixed"; seconds: number; paused: boolean }
  | { kind: "halfLife"; lo: number; hi: number; halfLifeSeconds: number; paused: boolean };

export interface GameTimerInput {
  phase: "planning" | "running" | "paused";
  durationMode?: DurationMode;
  /** The game's length in world seconds: the exact length in "fixed" mode, the half-life otherwise. */
  lengthSeconds?: number;
  /** World seconds now (advanceWorld). */
  world: number;
  /** Planning's deadline (unix ms, or seconds on very old games). */
  planningEndsAt?: number;
  nowMs: number;
}

/** What the timer shows, or null when there is nothing to count (no length known, or not a live phase). */
export function gameTimer(i: GameTimerInput): GameTimer | null {
  if (i.phase === "planning") {
    if (!i.planningEndsAt) return null;
    const end = i.planningEndsAt > 1e11 ? i.planningEndsAt : i.planningEndsAt * 1000;
    // Past the deadline, planning holds until every agent sandbox is ready: the world start is not yet known.
    return { kind: "planning", seconds: Math.max(0, (end - i.nowMs) / 1000), held: end <= i.nowMs };
  }
  const len = i.lengthSeconds;
  if (len === undefined || !Number.isFinite(len) || len <= 0) return null;
  const paused = i.phase === "paused";
  if (i.durationMode === "fixed") return { kind: "fixed", seconds: Math.max(0, len - i.world), paused };
  return { kind: "halfLife", ...halfLifeInterval90(len), halfLifeSeconds: len, paused };
}

/** m:ss, or h:mm:ss from an hour; counting down, so partial seconds round up (0:00 means over). */
export function formatClock(seconds: number, round: "up" | "down" = "up"): string {
  const s = Math.max(0, round === "up" ? Math.ceil(seconds - 1e-9) : Math.floor(seconds + 1e-9));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
