/**
 * Model calls on the server (integration plan §4.3–§4.4) over lib/v2-ai: which provider a deployment uses, and each
 * member's allowance per game (a human's assistant and pitch drafts, an AI player's turns). Keys are the deployment's
 * own (ANTHROPIC_API_KEY); local deployments with AI_MOCK=1 use the offline mock, so tests never reach a network.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { anthropicProvider, Budget, ChatError, DEFAULT_MODEL, findModel, mockProvider, type ChatProvider } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import { resolveContext, userById } from "./access";
import type { SpendKey } from "./spend";

/** The deployment's provider, or a refusal when none is configured. */
export function providerFor(): ChatProvider {
  if (process.env.AI_MOCK === "1") return mockProvider();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = findModel(DEFAULT_MODEL);
  if (!apiKey || !model) throw new OpFailure("No AI model is configured on this deployment.");
  return anthropicProvider({ apiKey, model: model.id, prices: model.prices });
}

const LIMITS = makeFunctionReference<"query", SpendKey, { tokens: number; usd: number; calls: number } | { refused: string }>("v2/spend:limitsOf");
const RECORD = makeFunctionReference<"mutation", SpendKey & { tokens: number; usd: number; calls: number }>("v2/spend:record");

/**
 * Runs model calls for a member within what every rule leaves, and records what was spent whatever happens (a billed
 * failure included). A refusal ("quota used up", "not an admin's room") is an OpFailure before any call; a model
 * failure reaches the caller as an OpFailure with its words.
 */
export async function spendWithin<T>(ctx: ActionCtx, key: SpendKey, run: (budget: Budget) => Promise<T>): Promise<T> {
  const limits = await ctx.runQuery(LIMITS, key);
  if ("refused" in limits) throw new OpFailure(limits.refused);
  const budget = new Budget(limits);
  try {
    return await run(budget);
  } catch (e) {
    if (e instanceof ChatError) throw new OpFailure(`The AI model could not answer: ${e.message}`);
    throw e;
  } finally {
    const spent = budget.snapshot();
    if (spent.calls > 0) await ctx.runMutation(RECORD, { ...key, tokens: spent.tokens, usd: spent.usd, calls: spent.calls });
  }
}

/** What a pitch draft needs: the caller's seat and card, and the other players' names (never their rules). */
export const pitchContext = internalQuery({
  args: { userId: v.string(), scope: v.any(), to: v.optional(v.array(v.string())) },
  handler: async (ctx, { userId, scope, to }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member || !r.player) return null;
    const rule = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", r.game!._id).eq("memberId", r.member!._id)).unique();
    const players = r.game.roster.filter(p => p.memberId !== r.member!._id && (!to?.length || to.includes(p.memberId))).map(p => ({ name: p.name }));
    return { roomId: r.game.roomId as Id<"v2Rooms">, gameId: r.game._id as Id<"v2Games">, memberId: r.member._id as Id<"v2Members">, card: rule?.card ?? "", players };
  },
});
