/**
 * What a pane that failed to load says (playtest round 8/04: "[CONVEX Q(v2/play:moves)] [Request ID: …] Server Error
 * Function execution timed out …", and Try again showed the same request). Pure, so it is unit tested.
 *
 * A server failure stays in the shared subscription while anything on the page reads it, so resetting the pane reads
 * the same error again: only a reload asks the server afresh (no client retry: docs/convex-read-architecture.md).
 */
export interface PaneErrorWords { readonly text: string; readonly reload: boolean }

export function paneErrorWords(error: unknown): PaneErrorWords {
  const message = error instanceof Error ? error.message : String(error);
  if (/^\[CONVEX [QMA]\(|Server Error|timed out/i.test(message)) {
    const slow = /timed out/i.test(message);
    return {
      text: slow ? "This pane could not load: the server took too long (it is busy right now)." : "This pane could not load: the server had a problem.",
      reload: true,
    };
  }
  return { text: `This pane could not load: ${message}`, reload: false };
}
