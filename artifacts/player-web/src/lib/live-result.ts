/**
 * What a live query shows (site/lib/convex.tsx useLive): its subscription's current value, with an error as a value
 * (the page shows it, rather than a throw into a blank screen). No client retry (read-architecture R6): Convex
 * resubscribes on reconnect, and the next value it delivers replaces the error.
 */
export type LiveResult<T> = { data: T | undefined; error: Error | null; isLoading: boolean };

/** `answer` is the subscription's value: undefined while it loads (or is skipped), an Error when the query failed. */
export function liveResult<T>(skip: boolean, answer: T | Error | undefined): LiveResult<T> {
  if (answer instanceof Error) return { data: undefined, error: answer, isLoading: false };
  return { data: answer, error: null, isLoading: !skip && answer === undefined };
}
