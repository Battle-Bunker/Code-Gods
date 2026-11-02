import { ConvexError } from "convex/values";

/** The user-facing message of an engine error: ConvexError data `{code, message}`, else the error text. */
export function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof ConvexError) {
    const data = e.data as { message?: unknown } | string;
    if (typeof data === "string") return data;
    if (data && typeof data.message === "string") return data.message;
  }
  const message = e instanceof Error ? e.message : String(e);
  // Errors without ConvexError data read "[CONVEX Q(x)] [Request ID: …] Server Error\nUncaught Error: <message> …".
  const uncaught = /Uncaught \w*Error: ([^\n]*)/.exec(message);
  return uncaught?.[1] || message.split("\n")[0] || "Unknown error";
}
/** The ConvexError code (UNAUTHENTICATED, FORBIDDEN, CONFLICT, …), if any. */
export function errCode(e: unknown): string | undefined {
  return e instanceof ConvexError ? (e.data as { code?: string } | undefined)?.code : undefined;
}
export const rid = () => crypto.randomUUID();
export const fmt = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
