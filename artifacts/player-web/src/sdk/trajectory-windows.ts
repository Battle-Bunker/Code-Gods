/**
 * The bits-over-time history as fixed windows of the event log (docs/convex-read-architecture.md R6, §6 PR 8).
 *
 * Every whole SLICE of batches before the latest batch is a closed window (`afterSeq`, `upTo`): its answer never changes, so
 * its subscription never re-runs on a tick. After the last whole slice, one live tail of at most SLICE batches follows
 * the ticks. A closed window is subscribed until it has loaded, then folded into the reader's history (immutable: a
 * closed window's points never change) and dropped, so a reader holds at most KEEP windows plus the tail however long
 * the game. The history starts over when the game, the point of view (a replay's `epoch`) changes or the latest batch
 * moves back behind it (a replay's playhead). No module store: each reader holds what it renders.
 */

/** Batches per window (a closed one and the tail alike): one execution reads at most this many tickBatches. */
export const SLICE = 10;
/** Closed windows subscribed at once while the history loads. */
export const KEEP = 10;
/** Points kept per object (the newest). */
export const MAX_POINTS = 600;

type Point = { seq: number };
export type TrajectoryPage<P extends Point = Point> = {
  gameId: string | null; objects: readonly { objectId: string; points: readonly P[] }[]; nextCursor: number; latestCursor: number; epoch?: string;
};
export type TrajectoryWindow = { afterSeq: number; upTo?: number; limit: number };
export type Series<P extends Point = Point> = ReadonlyMap<string, readonly P[]>;

/**
 * The windows to subscribe for a game whose latest batch is `latest` (-1: none known yet), with the history folded up
 * to batch `folded` (-1: none; always the end of a slice): the next closed windows after it (at most `keep`), each of
 * a whole slice before the latest batch, then the tail. `complete`: no closed window is left out, so the tail continues the closed ones.
 */
export function planWindows(latest: number, folded = -1, keep = KEEP): { closed: TrajectoryWindow[]; tail: TrajectoryWindow; complete: boolean } {
  // A slice closes once a later batch exists (a replay's playhead may stop inside its latest batch).
  const whole = Math.floor(Math.max(0, latest) / SLICE) * SLICE;
  const closed: TrajectoryWindow[] = [];
  for (let from = folded + 1; from < whole && closed.length < keep; from += SLICE) closed.push({ afterSeq: from - 1, upTo: from + SLICE - 1, limit: SLICE });
  const end = closed.at(-1)?.upTo ?? folded;
  return { closed, tail: { afterSeq: Math.max(whole - 1, folded), limit: SLICE }, complete: end >= whole - 1 };
}

/** `base` with `pages`' newer points appended, in order: a new map, sharing the arrays of the objects they leave alone. */
export function extendWith<P extends Point>(base: Series<P>, pages: readonly (TrajectoryPage<P> | undefined)[]): Map<string, readonly P[]> {
  const out = new Map(base);
  const grown = new Map<string, P[]>();
  for (const page of pages) if (page) for (const { objectId, points } of page.objects) {
    let mine = grown.get(objectId);
    const last = (mine ?? out.get(objectId))?.at(-1)?.seq ?? -Infinity;
    const fresh = points.filter(p => p.seq > last);
    if (!fresh.length) continue;
    if (!mine) grown.set(objectId, mine = [...(out.get(objectId) ?? [])]);
    mine.push(...fresh);
    out.set(objectId, mine);
  }
  return out;
}

/** The newest MAX_POINTS points of each series (the arrays are not changed). */
export function lastPoints<P extends Point>(series: Series<P>): Map<string, readonly P[]> {
  const out = new Map<string, readonly P[]>();
  for (const [id, points] of series) out.set(id, points.length > MAX_POINTS ? points.slice(-MAX_POINTS) : points);
  return out;
}

/** How many closed pages, from the first, have loaded (they fold into the history together). */
export function loadedRun(pages: readonly (TrajectoryPage | undefined)[]): number {
  const i = pages.findIndex(p => !p);
  return i < 0 ? pages.length : i;
}
