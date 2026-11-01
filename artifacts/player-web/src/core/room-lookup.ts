/**
 * The hosted client's room lookup. rooms.get throws (NOT_FOUND, FORBIDDEN, …) rather than returning null, so
 * the hosted root reads it through useQueries, which hands back the Error instead of throwing it into the
 * error boundary, and this turns the result into what the "Which room?" screen shows.
 */
import { ConvexError } from "convex/values";

export type RoomLookup<T> =
  | { state: "ask"; error?: string }
  | { state: "loading" }
  | { state: "found"; room: T };

export function roomLookup<T>(code: string, result: T | Error | undefined): RoomLookup<T> {
  if (!code) return { state: "ask" };
  if (result === undefined) return { state: "loading" };
  if (!(result instanceof Error)) return { state: "found", room: result };
  const data = result instanceof ConvexError ? result.data as { code?: string; message?: string } | string : undefined;
  if (typeof data === "object" && data?.code === "NOT_FOUND") return { state: "ask", error: `No room ${code} on this engine.` };
  const message = typeof data === "object" && data?.message ? data.message : typeof data === "string" ? data : result.message;
  return { state: "ask", error: message.split("\n")[0] };
}
