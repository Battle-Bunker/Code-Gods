/**
 * Idle parking (plan §0). The engine is "active" for 30 minutes after authenticated human activity. Only an
 * explicit `activity.touch` (clients call it on real interaction, at most once a minute), room creation and
 * joining, and the owner's start/resume count: AI turns, polling, subscriptions and heartbeats never do.
 * When idle, the tick loop and the watchdog park running games in `recovery` with auto-resume; a touch
 * resumes them. A fresh deployment starts idle.
 */
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./auth/access";
import { resumeGame } from "./engine/loop";
import { fail } from "./lib/errors";
import { lastHumanActivity, principalV, viewerOf } from "./lib/rooms";
import { IDLE_MS } from "./lib/world";

/** Writes at most once a minute (unless forced), then resumes idle-parked games. */
export async function touchActivity(ctx: MutationCtx, force = false) {
  const now = Date.now();
  const doc = await ctx.db.query("activity").withIndex("by_key", q => q.eq("key", "global")).unique();
  if (doc && !force && now - doc.lastHumanActivityAt < 60_000) return { resumed: 0 };
  if (doc) await ctx.db.patch(doc._id, { lastHumanActivityAt: now });
  else await ctx.db.insert("activity", { key: "global", lastHumanActivityAt: now });
  const parked = await ctx.db.query("games").withIndex("by_phase", q => q.eq("phase", "recovery")).take(200);
  let resumed = 0;
  for (const game of parked) if (game.autoResume) { await resumeGame(ctx, game); resumed++; }
  return { resumed };
}

/** Authenticated human activity (browser, or a player credential with act/owner: the assistant's `wake`). */
async function touchFor(ctx: MutationCtx, viewer: Viewer) {
  if (viewer.scope === "player" && viewer.permission === "read") {
    fail("FORBIDDEN", "Read-only assistants cannot wake the engine. Resume in your signed-in browser.");
  }
  const { resumed } = await touchActivity(ctx);
  return { active: true as const, idleDeadline: Date.now() + IDLE_MS, resumed };
}
export const touch = mutation({ args: {}, handler: async (ctx) => touchFor(ctx, await requireViewer(ctx)) });
export const touchAs = internalMutation({ args: { principal: principalV }, handler: async (ctx, { principal }) => touchFor(ctx, await viewerOf(ctx, principal)) });

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const last = await lastHumanActivity(ctx);
    return { idle: Date.now() - last >= IDLE_MS, lastHumanActivityAt: last || null, idleDeadline: last ? last + IDLE_MS : null };
  },
});

