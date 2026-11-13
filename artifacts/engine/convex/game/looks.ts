/**
 * A paid look at every object (paid observation: lib/knowledge.ts, docs/energy-model.md §11). The look command
 * (game/commands.ts) charges the god for all of them at once and schedules this: the god's rows are rewritten from the
 * objects as they are, a small page at a time (off the command's transaction, like the read model's fill).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { boardsLive, paidLive } from "../lib/knowledge";
import { syncRows } from "./objectViews";

const PAGE = 25;

export const page = internalMutation({
  /** `remaining`: how many objects the look still covers, oldest first (the count it was charged for); absent: all. */
  args: { gameId: v.id("games"), godId: v.string(), world: v.number(), cursor: v.union(v.string(), v.null()), remaining: v.optional(v.number()) },
  handler: async (ctx, { gameId, godId, world, cursor, remaining }) => {
    const game = await ctx.db.get(gameId);
    // Once ended the end's fill makes every row exact.
    if (!game || !paidLive(game)) return;
    if (remaining !== undefined && remaining <= 0) return;
    // by_game is creation order: the first `remaining` objects are the ones that existed when the price was quoted.
    const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: Math.min(PAGE, remaining ?? PAGE) });
    const me: ReadonlySet<string> = new Set([godId]);
    await syncRows(ctx, objects.page, true, { world, told: () => me, boards: boardsLive(game) });
    const left = remaining === undefined ? undefined : remaining - objects.page.length;
    if (!objects.isDone && (left === undefined || left > 0)) {
      await ctx.scheduler.runAfter(0, internal.game.looks.page, { gameId, godId, world, cursor: objects.continueCursor, ...(left !== undefined ? { remaining: left } : {}) });
    }
  },
});
