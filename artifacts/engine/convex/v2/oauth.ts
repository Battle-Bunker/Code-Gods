/** An MCP client's OAuth request by the key in its /connect link (agent/oauth.ts creates them). No heavy imports. */
import type { QueryCtx } from "../_generated/server";
import { sha256Hex } from "../auth/crypto";

/** The request, whatever its status, or null when the text is no such key. */
export async function oauthRequest(ctx: QueryCtx, key: string) {
  if (key.length < 20 || key.length > 128) return null;
  const keyHash = await sha256Hex(key);
  return await ctx.db.query("oauthRequests").withIndex("by_key", q => q.eq("keyHash", keyHash)).unique();
}
