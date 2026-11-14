/** What `agent.check` runs on: the caller's rule and energy, and up to three of the game's objects. */
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { resolveContext, userById } from "./access";

export const context = internalQuery({
  args: { userId: v.string(), scope: v.any() },
  handler: async (ctx, { userId, scope }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member || !r.player) return null;
    const rule = (await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", r.game!._id).eq("memberId", r.member!._id)).unique())!;
    const objects = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", r.game!._id)).take(3);
    const samples = [];
    for (const o of objects) {
      const st = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique();
      if (st) samples.push({ objectId: o._id as string, state: st.state });
    }
    return { variant: r.game.variant, seed: r.game.seed, energy: r.player.energy, rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker }, samples };
  },
});
