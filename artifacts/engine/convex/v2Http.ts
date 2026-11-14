/**
 * Engine v2's HTTP routes (registered by convex/http.ts; the affordance scan keeps httpActions out of convex/v2):
 *   GET /api/v2/replay/<gameId>  an ended game's stored replay file, for a member of its room, checked on every request
 *                                against the caller's Convex JWT (`Authorization: Bearer`): never a storage URL.
 */
import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { BEARER_CORS } from "./auth/routes";

const FILE_FOR = makeFunctionReference<"query", { gameId: string }, Id<"_storage"> | null>("v2/replays:fileFor");
const reply = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...BEARER_CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const STATUS: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

export const v2ReplayDownload = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);   // api, v2, replay, <gameId>
  if (parts.length !== 4 || !parts[3]) return reply({ error: "GET /api/v2/replay/<gameId>" }, 400);
  let file: Id<"_storage"> | null;
  try {
    file = await ctx.runQuery(FILE_FOR, { gameId: decodeURIComponent(parts[3]) });
  } catch (error) {
    const data = error instanceof ConvexError ? error.data as { code?: string; message?: string } : null;
    if (data?.code && STATUS[data.code]) return reply({ error: data.message ?? data.code, code: data.code }, STATUS[data.code]!);
    console.error("v2 replay download failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Internal error" }, 500);
  }
  const blob = file && await ctx.storage.get(file);
  if (!blob) return reply({ error: "This game's replay is not stored (yet): fold its events instead", code: "NOT_FOUND" }, 404);
  return new Response(blob, { headers: { ...BEARER_CORS, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
});

/** The CORS preflight of the replay route (a page on another origin sends its Authorization header). */
export const v2ReplayPreflight = httpAction(async () => new Response(null, { status: 204, headers: BEARER_CORS }));
