/**
 * v1's retry-uncertain banner (A13; W3-2 #954): when a command's call throws with no answer (the network dropped, a
 * timeout), nobody knows whether it applied. Every operation that takes a requestId is sent with one, so sending the
 * same command again with the same requestId applies it at most once. The banner offers exactly that.
 */
import { useSyncExternalStore } from "react";

/** The args with a fresh requestId when the operation takes one and the caller gave none. */
export function withRequestId(params: unknown, args: unknown): unknown {
  const shape = (params as { shape?: Record<string, unknown> } | null)?.shape;
  if (!shape || !("requestId" in shape)) return args;
  const a = (args ?? {}) as Record<string, unknown>;
  return a.requestId ? a : { ...a, requestId: crypto.randomUUID() };
}

/**
 * A throw with no answer from the server (the connection dropped while the call was in flight, a timeout): it may or
 * may not have applied. A server error is an answer (its transaction rolled back), so it is not uncertain.
 */
export const isUncertain = (e: unknown): boolean =>
  e instanceof Error && !/\[CONVEX|Server Error|ConvexError/i.test(e.message) && /connection|network|fetch|timed? ?out|offline|in flight/i.test(e.message);

export interface Uncertain { readonly id: string; readonly title: string; readonly args: unknown }
let current: Uncertain | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function reportUncertain(u: Uncertain): void { current = u; emit(); }
export function clearUncertain(): void { current = null; emit(); }
export function useUncertain(): Uncertain | null {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => current, () => null);
}
