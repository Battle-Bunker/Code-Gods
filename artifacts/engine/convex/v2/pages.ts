/**
 * The page a v2 page query reads, whatever the client asks (docs/convex-read-architecture.md R8: a page query reads one
 * index page). A client may ask for any size (the results pane asked for 200 moves at a time, and at the end of a long
 * game each page then read hundreds of KiB and timed out); the server answers at most `max`, and the client's paginated
 * hook reads on from the cursor it returns.
 */
import type { PaginationOptions } from "convex/server";

export const PAGE_MAX = 50;

export function pageOpts(opts: PaginationOptions, max = PAGE_MAX): PaginationOptions {
  return { ...opts, numItems: Math.max(1, Math.min(opts.numItems, max)) };
}
