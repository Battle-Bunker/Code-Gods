/**
 * Line turnover (docs/engine-v2/retirement-design.md), the pure part: which lines are live, how many retire when lines
 * are born, and which a tick may offer. Off unless a game's settings carry `turnover` (a room's `liveCap`): then every
 * number up to the engine's object count is live and the draws are exactly the ones before turnover existed.
 */
import type { Turnover } from "./presets.ts";

/** The live lines' numbers, oldest first: the engine's list under turnover, else every number up to `objects`. */
export function liveLines(engine: { objects: number; live?: readonly number[] }): number[] {
  return engine.live ? [...engine.live] : Array.from({ length: engine.objects }, (_, i) => i + 1);
}

/**
 * How many of the oldest live lines retire when `born` lines are born: before each birth the oldest retires while the
 * live count is at the cap (retire before birth: the count never passes it). Births past the cap in one commit retire
 * that commit's own newborns too; those are not counted here.
 */
export const retiringCount = (live: number, born: number, cap: number | null) => cap === null ? 0 : Math.min(live, Math.max(0, live + born - cap));

/** The lines a tick may offer: the live lines that its births will not retire (a newborn is offered from the next tick). */
export const offerable = (live: readonly number[], born: number, cap: number | null) => live.slice(retiringCount(live.length, born, cap));

/** One offer's line: uniform over the offerable lines (with every line live, `1 + below(n)`, the draw before turnover). */
export const pickLine = (lines: readonly number[], r: { below(n: number): number }) => lines[r.below(lines.length)]!;

/** The cap a game's settings give, or null (no turnover). */
export const capOf = (settings: { turnover?: Turnover }) => settings.turnover?.liveCap ?? null;
