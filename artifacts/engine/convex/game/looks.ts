/**
 * A paid look at every object (paid observation: lib/knowledge.ts, docs/energy-model.md §11). The look command
 * (game/commands.ts) charges the god for all of them at once and schedules this: the god's rows are rewritten from the
 * objects as they are, a small page at a time (off the command's transaction, like the read model's fill).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { paidLive } from "../lib/knowledge";
import { syncRows } from "./objectViews";

const PAGE = 25;

export const page = internalMutation({
  args: { gameId: v.id("games"), godId: v.string(), world: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, godId, world, cursor }) => {
    const game = await ctx.db.get(gameId);
    // Once ended the end's fill makes every row exact.
    if (!game || !paidLive(game)) return;
    const objects = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: PAGE });
    const me: ReadonlySet<string> = new Set([godId]);
    await syncRows(ctx, objects.page, true, { world, told: () => me });
    if (!objects.isDone) await ctx.scheduler.runAfter(0, internal.game.looks.page, { gameId, godId, world, cursor: objects.continueCursor });
  },
});
