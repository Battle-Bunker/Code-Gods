/** What `agent.check` runs on: the caller's rule and energy, and up to three of the game's objects. */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { resolveContext, userById } from "./access";
import { knownOf, readsKnowledge } from "./knowledge";
import { priceScaleOf } from "./pricing";
import { programOf } from "./loop";

export const context = internalQuery({
  args: { userId: v.string(), scope: v.any(), agentId: v.optional(v.string()) },
  handler: async (ctx, { userId, scope, agentId }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member || !r.player) return null;
    const rule = (await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", r.game!._id).eq("memberId", r.member!._id)).unique())!;
    const objects = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", r.game!._id)).take(3);
    const samples = [];
    // Paid observation (knowledge.ts): the samples are the objects as the player was last told them.
    const paid = readsKnowledge(r.game, r.member._id);
    for (const o of objects) {
      const known = paid ? await knownOf(ctx, o._id, r.member._id) : null;
      const st = known ?? await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique();
      if (st) samples.push({ objectId: o._id as string, state: st.state });
    }
    // The agent whose program this would replace (the caller's own, live), for the edit price.
    const id = agentId ? ctx.db.normalizeId("v2Agents", agentId) : null, agent = id ? await ctx.db.get(id) : null;
    if (agentId && (!agent || agent.memberId !== r.member._id || agent.gameId !== r.game._id || agent.destroyedAt !== undefined)) return { refused: "That agent is not yours." };
    return {
      variant: r.game.variant, seed: r.game.seed, energy: r.player.energy, priceScale: priceScaleOf(r.game), rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker }, samples,
      current: agent ? { language: agent.language, source: (await programOf(ctx, agent)).source } : null,
    };
  },
});

/** What a program's background estimate runs on (checkNode.ts estimate): its owner's rule and energy, three objects. */
export const estimateContext = internalQuery({
  args: { programId: v.string() },
  handler: async (ctx, { programId }) => {
    const id = ctx.db.normalizeId("v2AgentPrograms", programId), program = id ? await ctx.db.get(id) : null;
    const agent = program ? await ctx.db.get(program.agentId) : null;
    const game = agent ? await ctx.db.get(agent.gameId) : null;
    if (!program || !agent || !game) return null;
    const rule = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", agent.memberId)).unique();
    const player = await ctx.db.query("v2Players").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", agent.memberId)).unique();
    if (!rule || !player) return null;
    const objects = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", game._id)).take(3), samples = [];
    for (const o of objects) {
      const st = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique();
      if (st) samples.push({ objectId: o._id as string, state: st.state });
    }
    return {
      variant: game.variant, seed: game.seed, energy: player.energy, priceScale: priceScaleOf(game), samples,
      rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker }, language: program.language, source: program.source,
    };
  },
});

export const setEstimate = internalMutation({
  args: { programId: v.string(), estimate: v.union(v.object({ perAct: v.number(), read: v.number(), change: v.number() }), v.null()) },
  handler: async (ctx, { programId, estimate }) => {
    const id = ctx.db.normalizeId("v2AgentPrograms", programId);
    if (id && await ctx.db.get(id)) await ctx.db.patch(id, { estimate });
  },
});
