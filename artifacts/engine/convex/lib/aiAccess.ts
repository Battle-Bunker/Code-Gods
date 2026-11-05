/**
 * Who may spend AI tokens (the owner's rule, 2026-11-03): only rooms whose OWNER is an administrator (a verified
 * ADMIN_EMAILS address, auth/identity.ts isAdminUser). Checked where tokens are spent (AI seat reservations,
 * assistant turns, starting with AI seats, seating one) and when it is read, so a change of owner or of the allowlist
 * takes effect at the next call. One indexed read of the owner's `users` row.
 */
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isAdminUser } from "../auth/identity";
import { fail } from "./errors";

export const AI_ADMIN_ONLY = "AI is only available in rooms run by an administrator for now";

export async function aiEnabledFor(ctx: QueryCtx, room: Pick<Doc<"rooms">, "ownerId">): Promise<boolean> {
  const owner = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", room.ownerId)).unique();
  return !!owner && isAdminUser(owner, process.env);
}
export async function requireAiEnabled(ctx: QueryCtx, room: Pick<Doc<"rooms">, "ownerId">): Promise<void> {
  if (!(await aiEnabledFor(ctx, room))) fail("FORBIDDEN", AI_ADMIN_ONLY);
}

/** The room's quotas (tokens per game; 0 = none). */
export const aiQuotaOf = (room: Pick<Doc<"rooms">, "aiQuota">) => room.aiQuota;
export const assistantQuotaOf = (room: Pick<Doc<"rooms">, "assistantQuota">) => room.assistantQuota;
