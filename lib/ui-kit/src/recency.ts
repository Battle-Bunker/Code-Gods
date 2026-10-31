/**
 * Recently run commands, per viewer, in localStorage (or any Storage-like object). Every access is guarded: a
 * private window, blocked site data or a corrupt value yields an empty list, never an error.
 */
export const RECENT_MAX = 8;
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function pushRecent(list: readonly string[], id: string, max = RECENT_MAX): string[] {
  return [id, ...list.filter(x => x !== id)].slice(0, max);
}

export function readRecent(storage: StorageLike | null | undefined, key: string): string[] {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

export function recordRecent(storage: StorageLike | null | undefined, key: string, id: string): string[] {
  const next = pushRecent(readRecent(storage, key), id);
  try { storage?.setItem(key, JSON.stringify(next)); } catch { /* blocked storage: recency is a convenience */ }
  return next;
}

/** window.localStorage, or null where reading it throws. */
export function browserStorage(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
