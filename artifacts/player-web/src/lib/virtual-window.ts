/**
 * The window of a virtualised list of fixed-height rows (docs/convex-read-architecture.md R1, §2.2 point 2): only the
 * rows in view, plus `overscan` either side, mount, so only they hold a per-row subscription.
 */

/** Rows assumed in view before the first layout measures the viewport: a screenful, never the whole list. */
export const FIRST_SCREEN_ROWS = 20;

/** The rows [start, end) to mount for a scroll position. */
export function visibleWindow({ scrollTop, viewport, rowHeight, count, overscan }: {
  scrollTop: number; viewport: number; rowHeight: number; count: number; overscan: number;
}): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const inView = viewport > 0 ? Math.ceil((Math.max(0, scrollTop) + viewport) / rowHeight) : first + FIRST_SCREEN_ROWS;
  return { start: Math.min(count, Math.max(0, first - overscan)), end: Math.min(count, inView + overscan) };
}

/** Whether the list should load its next page: the window reaches within a screenful of the last loaded row. */
export function wantsMore({ end, count }: { end: number; count: number }): boolean {
  return count === 0 || end >= count - FIRST_SCREEN_ROWS;
}

/**
 * How tall a scrolling list may be: 640 px on a wide screen; on a phone at most 45% of the screen's height, so a swipe
 * beside or below it scrolls the page (a walker's swipes kept landing in a 640 px Objects list that filled the screen).
 */
export function listMaxHeight(s: { phone: boolean; viewportHeight: number; max?: number }): number {
  const max = s.max ?? 640;
  return s.phone && s.viewportHeight > 0 ? Math.min(max, Math.max(200, Math.round(s.viewportHeight * 0.45))) : max;
}
