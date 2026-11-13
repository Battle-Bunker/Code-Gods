/**
 * The examination cache (pure). An examination (validate, summon) runs the agent about 230 times: once per object of
 * the season's reference mixture and of the game's first objects, plus a futility probe. Every one of those runs is
 * deterministic: the same (source, settings, object, seed) gives the same answer (game-runtime `act`). So the runs
 * are remembered per agent program, and an examination runs only what it has not seen:
 *   - summon after validate on the same board runs nothing;
 *   - the same program in another game (the pre-filled examples every beginner summons) runs only that game's own
 *     objects (about 40 of the 230), since the reference objects and their seeds are the season's.
 * Nothing about the result changes: the price and the estimate are computed from the same answers as before.
 *
 * What is safe to share: the key is the program's own text (with its language, the room's rules that reach the
 * sandbox, the season and the runtime), so an entry is only ever read by someone who already has that exact program,
 * and it holds only that program's answers on objects: no player, no room, no goal.
 */

/** Bump when what an entry means changes (the stored fields, or how runs are keyed). */
export const EXAMINATION_CACHE_VERSION = 1;
/** Entries kept per program: one examination uses about 230; the rest remembers a few other boards. */
export const MAX_CACHED_RUNS = 600;
/** A longer answer is not remembered (it is simply run again). */
export const MAX_CACHED_CALLS = 2000;
/** The runs' answers kept per program, in characters: the document stays far below Convex's 1 MiB whatever the answers' size. */
export const MAX_CACHED_CHARS = 300_000;
/** An entry answered from memory alone is marked used again once it is this old, so the prune never drops one in use. */
export const TOUCH_AFTER_MS = 24 * 3600_000;

export type CachedRun = { k: string; calls: string; usedRandom: boolean; steps?: number; readBits?: number };

/**
 * The runs to keep after an examination: the ones it used (remembered or new) first, then the others already
 * stored, up to MAX_CACHED_RUNS runs and MAX_CACHED_CHARS characters of answers. So the reference objects' runs, used by every examination, are never pushed out by
 * the boards of other games.
 */
export function mergeRuns(used: readonly CachedRun[], stored: readonly CachedRun[], limit = MAX_CACHED_RUNS, chars = MAX_CACHED_CHARS): CachedRun[] {
  const out: CachedRun[] = [], seen = new Set<string>();
  let size = 0;
  for (const run of [...used, ...stored]) {
    if (out.length >= limit) break;
    if (seen.has(run.k) || run.calls.length > MAX_CACHED_CALLS || size + run.calls.length > chars) continue;
    seen.add(run.k); out.push(run); size += run.calls.length;
  }
  return out;
}
