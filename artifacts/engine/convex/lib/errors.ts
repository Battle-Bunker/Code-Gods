import { ConvexError } from "convex/values";

export type ErrorCode =
  | "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE" | "UNAUTHENTICATED";

/** A user-facing failure: clients read `error.data.code` and `error.data.message`. */
export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

/** The message of any error, ConvexError data included (for receipts). */
export function messageOf(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: unknown } | string;
    if (typeof data === "string") return data;
    if (data && typeof data.message === "string") return data.message;
  }
  return error instanceof Error ? error.message : String(error);
}
