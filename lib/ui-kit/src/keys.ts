/**
 * The palette's global keys (docs/research/ui-redesign/palette-and-pages.md §2.1): Cmd/Ctrl+K opens and closes it
 * from anywhere, including inside inputs; "/" opens it and "?" opens its Help page, but only when no editable
 * element has focus and no dialog is open, so typing in chat or an editor is never hijacked.
 */
export type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean };
export type KeyEnv = { editable: boolean; dialogOpen: boolean; paletteOpen: boolean };

export function paletteKey(e: KeyLike, env: KeyEnv): "toggle" | "open" | "help" | null {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") return "toggle";
  if (e.metaKey || e.ctrlKey || e.altKey || env.editable || env.dialogOpen || env.paletteOpen) return null;
  if (e.key === "/") return "open";
  if (e.key === "?") return "help";
  return null;
}

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "time", "week", ""]);

/** Is this element one that takes typed text (an input, a textarea, a select, or contenteditable)? */
export function isEditable(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((el.type ?? "").toLowerCase());
  return false;
}

/** The platform's shortcut label: "⌘K" on Apple platforms, "Ctrl K" elsewhere. */
export function shortcutLabel(): string {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘K" : "Ctrl K";
}
