/**
 * The bits-over-time history as fixed windows of the event log (docs/convex-read-architecture.md R6, §6 PR 8): every
 * whole SLICE of batches already written is a closed window (`afterSeq`, `upTo`), an immutable subscription that
 * never re-runs; after the last whole slice, one live tail of at most SLICE batches follows the ticks. A window is
 * dropped when the latest batch moves back (a replay's playhead) or the game changes; the tail moves on once a slice
 * fills, and the slice becomes a closed window. No module store: the panels hold the subscriptions they render.
 */

/** Batches per window (a closed one and the tail alike): one execution reads at most this many tickBatches. */
export const SLICE = 10;
/** Points kept per object (the newest). */
export const MAX_POINTS = 600;

export type TrajectoryPoint = { seq: number; worldSeconds: number; value: number | string; ownNetBits: number; peerNetBits: number; payoff: number };
export type TrajectoryPage = { gameId: string | null; objects: readonly { objectId: string; points: readonly TrajectoryPoint[] }[]; nextCursor: number; latestCursor: number };
export type TrajectoryWindow = { afterSeq: number; upTo?: number; limit: number };

/**
 * The windows of a game whose latest batch is `latest` (-1: none known yet): a closed window per whole slice of
 * batches up to `latest`, then the tail (no `upTo`) from the first batch after them.
 */
export function trajectoryWindows(latest: number): TrajectoryWindow[] {
  const whole = Math.floor((Math.max(-1, latest) + 1) / SLICE) * SLICE;
  const out: TrajectoryWindow[] = [];
  for (let from = 0; from < whole; from += SLICE) out.push({ afterSeq: from - 1, upTo: from + SLICE - 1, limit: SLICE });
  out.push({ afterSeq: whole - 1, limit: SLICE });
  return out;
}

/** Each object's points from `pages` in log order (a page's points after the last seq already taken), unbounded. */
export function mergePages(pages: readonly (TrajectoryPage | undefined)[]): Map<string, TrajectoryPoint[]> {
  const out = new Map<string, TrajectoryPoint[]>();
  for (const page of pages) if (page) for (const { objectId, points } of page.objects) {
    const known = out.get(objectId);
    if (!known) { out.set(objectId, [...points]); continue; }
    const last = known.at(-1)?.seq ?? -Infinity;
    for (const p of points) if (p.seq > last) known.push(p);
  }
  return out;
}

/** `base` with `page`'s newer points appended: a new map, sharing the arrays of the objects the page leaves alone. */
export function extendWith(base: ReadonlyMap<string, TrajectoryPoint[]>, page: TrajectoryPage | undefined): Map<string, TrajectoryPoint[]> {
  const out = new Map(base);
  if (page) for (const { objectId, points } of page.objects) {
    const known = out.get(objectId) ?? [];
    const last = known.at(-1)?.seq ?? -Infinity;
    const fresh = points.filter(p => p.seq > last);
    if (fresh.length) out.set(objectId, [...known, ...fresh]);
  }
  return out;
}

/** The newest MAX_POINTS points of each object's series (the arrays are not changed). */
export function lastPoints(series: ReadonlyMap<string, TrajectoryPoint[]>): Map<string, TrajectoryPoint[]> {
  const out = new Map<string, TrajectoryPoint[]>();
  for (const [id, points] of series) out.set(id, points.length > MAX_POINTS ? points.slice(-MAX_POINTS) : points);
  return out;
}
