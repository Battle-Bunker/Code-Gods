/**
 * When a live query's failure is worth retrying (site/lib/convex.tsx useLive, the replay's pages in core/replay/replay-game.tsx). Convex re-runs a failed query only
 * when the data it read changes, so a timeout under load or a server error would otherwise stay on the page for good.
 * The engine's own refusals (ConvexError: not signed in, forbidden, not found) are answers and are never retried.
 */
import { ConvexError } from "convex/values";

export function transientQueryError(error: unknown): boolean {
  return error instanceof Error && !(error instanceof ConvexError);
}

/** The wait before retry number `attempt` (from 0): 1 s, doubling, at most 30 s. */
export const retryDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);
