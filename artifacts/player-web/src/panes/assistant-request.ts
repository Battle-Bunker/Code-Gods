/**
 * Bringing the assistant's composer into view from anywhere (v1's composer.focus / composer.fill): Ctrl+` and "/" focus
 * it, "ask my assistant" on a line puts the line in a message ("Line 3: "), the palette's "Focus assistant". Nothing is
 * sent: the player finishes the message and presses Send. The composer takes the request once (on its next render or
 * as it mounts after the pane opens).
 */
export interface ComposerRequest { fill?: string }

let pending: ComposerRequest | null = null;
const listeners = new Set<() => void>();

export async function requestComposer(r: ComposerRequest, openPane: (pane: string) => Promise<unknown>): Promise<void> {
  pending = r;
  for (const l of listeners) l();
  await openPane("assistant");
  // The pane may have been open already: tell the composer again once it is surely there.
  for (const l of listeners) l();
}
export function takeComposerRequest(): ComposerRequest | null { const r = pending; pending = null; return r; }
export function onComposerRequest(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** The draft after a fill: the reference first, then what the player had already typed (never lost). */
export const filledDraft = (draft: string, fill: string | undefined) => (fill ? (draft.trim() ? `${fill}${draft}` : fill) : draft);

/** The page's own keys for the composer (v1): Ctrl+` from anywhere; "/" only outside a field, a chord or an open dialog. */
export function composerKey(e: { key: string; ctrl?: boolean; meta?: boolean; alt?: boolean; typing?: boolean; dialog?: boolean }): boolean {
  if (e.ctrl && e.key === "`") return true;
  if (e.typing || e.ctrl || e.meta || e.alt || e.dialog) return false;
  return e.key === "/";
}
