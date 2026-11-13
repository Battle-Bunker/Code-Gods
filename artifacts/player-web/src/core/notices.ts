/**
 * Short-lived notices under the header ("Copied the room link", a palette command's error): one line, polite live
 * region, gone after a few seconds. The palette's commands and the dock report here instead of alert().
 */
import { useSyncExternalStore } from "react";

export type Notice = { id: number; text: string; tone: "info" | "error" };
let notices: readonly Notice[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = (value: readonly Notice[]) => { notices = value; for (const l of listeners) l(); };

/**
 * How long a notice stays: long enough to read. 4 s at least (6 s for an error), about a second for every 12
 * characters (two to three words a second), 15 s at most.
 */
export function noticeMs(text: string, tone: Notice["tone"] = "info"): number {
  return Math.min(15_000, Math.max(tone === "error" ? 6000 : 4000, Math.round(text.trim().length / 12 * 1000)));
}

export const noticeStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => notices,
  /** `ms`: how long it stays (default: by its length, noticeMs); `Infinity` keeps it until it is dismissed (a link to copy by hand, a definition). */
  push(text: string, tone: Notice["tone"] = "info", ms = noticeMs(text, tone)): number {
    const id = next++;
    emit([...notices.slice(-2), { id, text, tone }]);
    if (Number.isFinite(ms)) setTimeout(() => noticeStore.dismiss(id), ms);
    return id;
  },
  dismiss(id: number) { if (notices.some(n => n.id === id)) emit(notices.filter(n => n.id !== id)); },
};

export const notify = (text: string): number => noticeStore.push(text);
/** A notice the player has to read or use (a link to copy by hand, a definition): it stays until dismissed. */
export const notifyKept = (text: string): number => noticeStore.push(text, "info", Infinity);

/** What a failure says: an engine error's `data.message` (ConvexError), else the error's message. */
export function errorText(error: unknown): string {
  const data = (error as { data?: { message?: string } | string })?.data;
  if (typeof data === "string") return data;
  return data?.message ?? (error instanceof Error ? error.message : String(error));
}
export const notifyError = (error: unknown) => noticeStore.push(errorText(error), "error", 9000);

export function useNotices() {
  return useSyncExternalStore(noticeStore.subscribe, noticeStore.get, noticeStore.get);
}
