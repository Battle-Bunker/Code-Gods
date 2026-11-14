/**
 * Model calls on the server (integration plan §4.3–§4.4) over lib/v2-ai: which provider a deployment uses, and each
 * member's allowance per game (a human's assistant and pitch drafts, an AI player's turns). Keys are the deployment's
 * own (ANTHROPIC_API_KEY); local deployments with AI_MOCK=1 use the offline mock, so tests never reach a network.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { anthropicProvider, Budget, DEFAULT_MODEL, findModel, mockProvider, type ChatProvider, type Usage } from "@workspace/v2-ai";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { resolveContext, userById } from "./access";

/** Per member per game: tokens (input plus output) and dollars. Copied from v1's defaults (300,000 tokens). */
export const ALLOWANCE = { tokens: 300_000, usd: 2 } as const;

/** The deployment's provider, or a refusal when none is configured. */
export function providerFor(): ChatProvider {
  if (process.env.AI_MOCK === "1") return mockProvider();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = findModel(DEFAULT_MODEL);
  if (!apiKey || !model) throw new OpFailure("No AI model is configured on this deployment.");
  return anthropicProvider({ apiKey, model: model.id, prices: model.prices });
}

/** The allowance left to a member in a game, as a budget for one run. */
export function budgetOf(used: { tokens: number; usd: number } | null): Budget {
  const tokens = ALLOWANCE.tokens - (used?.tokens ?? 0), usd = ALLOWANCE.usd - (used?.usd ?? 0);
  if (tokens <= 0 || usd <= 0) throw new OpFailure("Your AI allowance for this game is used up.");
  return new Budget({ tokens, usd });
}

export const usageOf = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }) => {
    const row = await ctx.db.query("v2AiUsage").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    return row ? { tokens: row.tokens, usd: row.usd } : null;
  },
});

export const record = internalMutation({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members"), tokens: v.number(), usd: v.number() },
  handler: async (ctx, a) => {
    const row = await ctx.db.query("v2AiUsage").withIndex("by_game_member", q => q.eq("gameId", a.gameId).eq("memberId", a.memberId)).unique();
    if (row) await ctx.db.patch(row._id, { tokens: row.tokens + a.tokens, usd: row.usd + a.usd, calls: row.calls + 1 });
    else await ctx.db.insert("v2AiUsage", { gameId: a.gameId, memberId: a.memberId, tokens: a.tokens, usd: a.usd, calls: 1 });
  },
});

export const tokensOf = (u: Usage) => u.inputTokens + u.outputTokens;

/** What a pitch draft needs: the caller's seat and card, and the other players' names (never their rules). */
export const pitchContext = internalQuery({
  args: { userId: v.string(), scope: v.any(), to: v.optional(v.array(v.string())) },
  handler: async (ctx, { userId, scope, to }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member || !r.player) return null;
    const rule = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", r.game!._id).eq("memberId", r.member!._id)).unique();
    const players = r.game.roster.filter(p => p.memberId !== r.member!._id && (!to?.length || to.includes(p.memberId))).map(p => ({ name: p.name }));
    return { gameId: r.game._id as Id<"v2Games">, memberId: r.member._id as Id<"v2Members">, card: rule?.card ?? "", players, used: null as null };
  },
});
