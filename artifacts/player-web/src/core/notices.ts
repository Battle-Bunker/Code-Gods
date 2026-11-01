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

export const noticeStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => notices,
  push(text: string, tone: Notice["tone"] = "info", ms = 6000) {
    const id = next++;
    emit([...notices.slice(-2), { id, text, tone }]);
    setTimeout(() => noticeStore.dismiss(id), ms);
  },
  dismiss(id: number) { if (notices.some(n => n.id === id)) emit(notices.filter(n => n.id !== id)); },
};

export const notify = (text: string) => noticeStore.push(text);

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
