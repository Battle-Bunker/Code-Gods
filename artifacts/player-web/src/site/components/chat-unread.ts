/**
 * The chat's unread mark (playtest round 34: in a game with people, chat was invisible and nothing said a message had
 * come). What this viewer last saw is a per-viewer convenience (localStorage, guarded), told to every mark on the page.
 */

/** Other people's messages after `seenAt` (room notices and your own never count). */
export function unreadCount(messages: readonly { memberId: string | null; at: number }[], seenAt: number, me: string | null): number {
  return messages.filter(c => c.memberId !== null && c.memberId !== me && c.at > seenAt).length;
}

const key = (roomId: string) => `cg-chat-seen:${roomId}`;
const EVENT = "cg-chat-seen";

/** This page's own record, so the mark clears even where storage is blocked (a private window). */
const memory = new Map<string, number>();

export function seenAt(roomId: string): number {
  let stored = 0;
  try { stored = Number(localStorage.getItem(key(roomId)) ?? 0) || 0; } catch { /* blocked: this page's record only */ }
  return Math.max(stored, memory.get(roomId) ?? 0);
}

/** The chat was read up to `at` (the newest message shown). */
export function markSeen(roomId: string, at: number): void {
  if (at <= seenAt(roomId)) return;
  memory.set(roomId, at);
  try { localStorage.setItem(key(roomId), String(at)); } catch { /* private window: the mark resets with the page */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { roomId, at } }));
}

export function onSeen(fn: (roomId: string, at: number) => void): () => void {
  const h = (e: Event) => { const d = (e as CustomEvent<{ roomId: string; at: number }>).detail; fn(d.roomId, d.at); };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
