/**
 * When the dock's error boundary (core-boundary.tsx) gives its children another go. No timer: Convex resubscribes
 * every query when it reconnects, so a remount is worth doing only once it has connected afresh since the error
 * (its `connectionCount` rose). A refused credential (the engine's UNAUTHENTICATED) stays refused across reconnects:
 * the human reconnects.
 */
export type CoreErrorKind = "credential" | "other";
export type CaughtError = { kind: CoreErrorKind; atConnection: number };

/** The engine's refusal of the caller (convex/auth/access.ts: ConvexError {code: "UNAUTHENTICATED"}). */
export function coreErrorKind(error: unknown): CoreErrorKind {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  if (code === "UNAUTHENTICATED") return "credential";
  return error instanceof Error && /\bUNAUTHENTICATED\b/.test(error.message) ? "credential" : "other";
}

export function clearsOnReconnect(caught: CaughtError, connectionCount: number): boolean {
  return caught.kind !== "credential" && connectionCount > caught.atConnection;
}
