/**
 * Retrying live queries that fail transiently (site/lib/convex.tsx useLive, the replay's pages in
 * core/replay/replay-game.tsx). Convex re-runs a failed query only when the data it read changes, so a timeout under
 * load would otherwise stay on the page for good. The engine's own refusals (ConvexError: not signed in, forbidden,
 * not found) are answers and are never retried; anything else is retried a few times with backoff, then shown.
 */
import { ConvexError } from "convex/values";

export function transientQueryError(error: unknown): boolean {
  return error instanceof Error && !(error instanceof ConvexError);
}

/** The wait before retry number `attempt` (from 0): 1 s, doubling, at most 30 s. */
export const retryDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);
/** Retries of one live query before its error is shown (about 31 s in all). */
export const MAX_RETRIES = 5;

export type LiveResult<T> = { data: T | undefined; error: Error | null; isLoading: boolean };
export type Retry<T> = { attempts: number; data: T | undefined; error: Error };

/**
 * What a live query shows. `answer` is the subscription's value (undefined while it loads or is dropped for a retry).
 * `retry`, while the query fails transiently: the retries made so far, its last answer and its error. During a retry
 * the last answer stays on screen, or the error if there was none (no flicker to loading and back); once the retries
 * are spent, or for an error that is not transient, the error is shown.
 */
export function liveResult<T>(skip: boolean, answer: T | Error | undefined, retry: Retry<T> | null): LiveResult<T> {
  const failed = answer instanceof Error;
  const pending = !!retry && (answer === undefined || (failed && transientQueryError(answer) && retry.attempts < MAX_RETRIES));
  if (pending) return retry!.data !== undefined ? { data: retry!.data, error: null, isLoading: false } : { data: undefined, error: retry!.error, isLoading: false };
  if (failed) return { data: undefined, error: answer, isLoading: false };
  return { data: answer, error: null, isLoading: !skip && answer === undefined };
}
