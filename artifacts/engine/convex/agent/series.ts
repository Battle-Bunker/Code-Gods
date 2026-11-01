/**
 * The player's utility series gathered across pages (player.series), as the principal, with the exact deltas added: the
 * read behind get_utility_series, the utility_series dataset and fit_utility_mixture (docs/public-log-design.md §4).
 */
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Principal } from "../lib/rooms";
import type { seriesFor } from "../player";

type Page = Awaited<ReturnType<typeof seriesFor>>;
export type Columns = Page["columns"] & { dOwn: (number | null)[]; dOthers: (number | null)[] };
export type Series = Omit<Page, "columns" | "cursor" | "done" | "pageDone" | "rows"> & { rows: number; truncated: boolean; columns: Columns };

/** At most `limit` rows from the start (after the filters, skipping the first `offset`), in pages of up to 4,000. */
export async function gatherSeries(ctx: ActionCtx, principal: Principal, roomId: string,
  options: { gameId?: string; objectId?: string; fromWorld?: number; offset?: number; limit: number }): Promise<Series> {
  let cursor: string | null = null, head: Page | undefined;
  const keys = ["world", "seq", "objectId", "kind", "version", "before", "value", "ownBefore", "othersBefore", "own", "others", "payoff", "mine"] as const;
  const out = Object.fromEntries([...keys, "dOwn", "dOthers"].map(k => [k, [] as unknown[]])) as unknown as Columns;
  let rows = 0, skipped = 0, truncated = false;
  for (;;) {
    const page: Page = await ctx.runQuery(internal.player.seriesAs, {
      principal, roomId, ...(options.gameId ? { gameId: options.gameId } : {}), ...(options.objectId ? { objectId: options.objectId } : {}),
      ...(options.fromWorld !== undefined ? { fromWorld: options.fromWorld } : {}), cursor, limit: 4000,
    });
    head ??= page;
    const c = page.columns;
    for (let i = 0; i < page.rows; i++) {
      if (skipped < (options.offset ?? 0)) { skipped++; continue; }
      if (rows >= options.limit) { truncated = true; break; }
      for (const k of keys) (out[k] as unknown[]).push(c[k][i]);
      out.dOwn.push(c.ownBefore[i] === null ? null : c.own[i] - c.ownBefore[i]!);
      out.dOthers.push(c.othersBefore[i] === null ? null : c.others[i] - c.othersBefore[i]!);
      rows++;
    }
    if (truncated || page.pageDone) break;
    cursor = page.cursor;
  }
  const { gameId, phase, live, self, others, partial } = head!;
  return { gameId, phase, live, self, others, partial, rows, truncated, columns: out };
}

/**
 * The first rows of a series that fit in `maxChars` of JSON, every column cut at the same row (the registry's generic
 * bound would trim columns unevenly and misalign them). `truncated` is set when rows were dropped.
 */
export function fitRows(series: Series, maxChars: number): Series {
  const empty = Object.fromEntries(Object.keys(series.columns).map(k => [k, []]));
  let used = JSON.stringify({ ...series, columns: empty }).length, n = 0;
  const cols = Object.values(series.columns) as unknown[][];
  for (; n < series.rows; n++) {
    // Each row adds its values and one comma per column (an approximation within a few characters per row).
    const row = cols.reduce((sum, col) => sum + (JSON.stringify(col[n]) ?? "null").length + 1, 0);
    if (used + row > maxChars) break;
    used += row;
  }
  if (n === series.rows) return series;
  const columns = Object.fromEntries(Object.entries(series.columns).map(([k, v]) => [k, (v as unknown[]).slice(0, n)])) as Columns;
  return { ...series, rows: n, truncated: true, columns };
}
