/**
 * What a pane that failed to load says (playtest round 8/04: "[CONVEX Q(v2/play:moves)] [Request ID: …] Server Error
 * Function execution timed out …", and Try again showed the same request). Pure, so it is unit tested.
 *
 * A server failure stays in the shared subscription while anything on the page reads it, so resetting the pane alone
 * reads the same error again. A failed live read (LiveError) is asked afresh by dropping and re-creating just its
 * subscription on a press of Try again; any other server error still reloads (no client retry loop:
 * docs/convex-read-architecture.md).
 */
export interface PaneErrorWords { readonly text: string; readonly reload: boolean }

/**
 * A live read that failed, with the query and arguments it was (sdk/live.ts throws it). The pane's error panel keeps
 * that same subscription open, so Convex's next answer to it (the server reruns a query when what it read changes)
 * shows the pane again: recovery by the subscription itself, with no retry, timer or reload (round 24).
 */
export class LiveError extends Error {
  readonly query: unknown;
  readonly args: unknown;
  constructor(cause: Error, query: unknown, args: unknown) {
    super(cause.message, { cause });
    this.name = "LiveError";
    this.query = query;
    this.args = args;
  }
}
/** The failed read's query and arguments, or null for any other error. */
export const liveSourceOf = (e: unknown): { query: unknown; args: unknown } | null => (e instanceof LiveError ? { query: e.query, args: e.args } : null);

/** `what` names what failed ("This pane", "Your totals"): never the server's raw text for a server failure. */
export function paneErrorWords(error: unknown, what = "This pane"): PaneErrorWords {
  const message = error instanceof Error ? error.message : String(error);
  if (/^\[CONVEX [QMA]\(|Server Error|timed out/i.test(message)) {
    const slow = /timed out/i.test(message);
    const live = error instanceof LiveError;
    return {
      text: `${what} could not load: ${slow ? "the server took too long (it is busy right now)." : "the server had a problem."}${live ? " It comes back by itself when the server answers; Try again asks it now." : ""}`,
      reload: !live,
    };
  }
  return { text: `${what} could not load: ${message}`, reload: false };
}
