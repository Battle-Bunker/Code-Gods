/**
 * The replay's playhead, pure: where a playing replay is at a moment, and which replay operation a step button
 * performs. The cursor in the human's view state (`replay.*` affordances) is where the playhead was last put; while
 * it plays, the page moves on from there in world time at the replay's speed and writes the cursor back only when it
 * stops (pause, a step, the end), so a playing replay sends nothing per frame.
 */
import type { ReplayCursor } from "@workspace/v2-affordances";
import { appliedAtWorld, nextStop, prevStop, resolveCursor, worldAt, type ReplayIndex } from "./fold.ts";

/** The playhead started (or re-started) at world time `world`, at wall-clock `at` (ms), at `speed`. */
export interface Anchor { world: number; at: number; speed: number }

/** The world time of a cursor: a time as given, else the time of the last event applied. */
export function cursorWorld(ix: ReplayIndex, cursor: ReplayCursor): number {
  if ("worldSeconds" in cursor && cursor.plus === 0) return Math.max(0, Math.min(ix.endWorld, cursor.worldSeconds));
  return worldAt(ix, resolveCursor(ix, cursor));
}

/** Where a playing replay is now: world time and events applied (never past the end). */
export function playheadAt(ix: ReplayIndex, anchor: Anchor, nowMs: number): { world: number; applied: number; done: boolean } {
  const world = Math.min(ix.endWorld, anchor.world + Math.max(0, nowMs - anchor.at) / 1000 * anchor.speed);
  const done = world >= ix.endWorld;
  return { world, applied: done ? ix.end : appliedAtWorld(ix, world), done };
}

/** The largest step `replay.step` takes; a longer jump is a seek. */
const MAX_STEP = 100;
export type StepOp = { id: "replay.step"; args: { by: number } } | { id: "replay.seek"; args: { seq: number } } | null;

/**
 * A step to the next or previous move from the playhead (`applied`), as an operation on the stored cursor (which
 * `cursorAt` events of the game resolve to: behind the playhead while playing). Null when there is nowhere to go.
 */
export function stepOp(ix: ReplayIndex, applied: number, cursorAt: number, direction: 1 | -1): StepOp {
  const target = direction > 0 ? nextStop(ix, applied) : prevStop(ix, applied);
  if (target === applied && target === cursorAt) return null;
  const by = target - cursorAt;
  return Math.abs(by) <= MAX_STEP && by !== 0 ? { id: "replay.step", args: { by } } : { id: "replay.seek", args: { seq: target } };
}
