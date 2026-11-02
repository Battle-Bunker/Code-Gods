/**
 * When the dock's error boundary (core-boundary.tsx) gives its children another go. No timer: Convex resubscribes
 * every query when it reconnects, so a remount is worth doing only once it has connected afresh since the error
 * (its `connectionCount` rose). A refused credential stays refused across reconnects: the human reconnects.
 */
export type CoreErrorKind = "credential" | "other";
export type CaughtError = { kind: CoreErrorKind; atConnection: number };

export const coreErrorKind = (message: string): CoreErrorKind => (/UNAUTHENTICATED|reconnect|revoked/i.test(message) ? "credential" : "other");

export function clearsOnReconnect(caught: CaughtError, connectionCount: number): boolean {
  return caught.kind !== "credential" && connectionCount > caught.atConnection;
}
