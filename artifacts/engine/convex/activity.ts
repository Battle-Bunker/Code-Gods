/**
 * The last authenticated human activity (the `activity` singleton, key "global"). Only an explicit `activity.touch`
 * (clients call it on real interaction, at most once a minute) counts: AI turns, polling, subscriptions and heartbeats
 * never do. The engine is "active" for IDLE_MS after it.
 */
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { fail } from "./lib/errors";

/** How long after the last human activity the engine counts as active. */
export const IDLE_MS = 30 * 60_000;

async function lastHumanActivity(ctx: QueryCtx): Promise<number> {
  const doc = await ctx.db.query("activity").withIndex("by_key", q => q.eq("key", "global")).unique();
  return doc?.lastHumanActivityAt ?? 0;
}

/** Writes at most once a minute (unless forced). */
export async function touchActivity(ctx: MutationCtx, force = false) {
  const now = Date.now();
  const doc = await ctx.db.query("activity").withIndex("by_key", q => q.eq("key", "global")).unique();
  if (doc && !force && now - doc.lastHumanActivityAt < 60_000) return;
  if (doc) await ctx.db.patch(doc._id, { lastHumanActivityAt: now });
  else await ctx.db.insert("activity", { key: "global", lastHumanActivityAt: now });
}

/** Authenticated human activity (browser, or a player credential with act/owner). */
export const touch = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.scope === "player" && viewer.permission === "read") {
      fail("FORBIDDEN", "Read-only connections cannot wake the engine. Resume in your signed-in browser.");
    }
    await touchActivity(ctx);
    return { active: true as const, idleDeadline: Date.now() + IDLE_MS };
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const last = await lastHumanActivity(ctx);
    return { idle: Date.now() - last >= IDLE_MS, lastHumanActivityAt: last || null, idleDeadline: last ? last + IDLE_MS : null };
  },
});
