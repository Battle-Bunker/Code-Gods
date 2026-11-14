/**
 * The transactional halves of the action affordances (agent.summon, agent.replace, agent.putBack): the action
 * (ops/agent.ts) has checked the caller through `defineOp`; these resolve the seat again in their own transaction and
 * pay and write. Internal: reached only through the ops.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { resolveContext, userById, type Scope } from "./access";
import { ownAgent, reprogram, summonAgent } from "./agents.ts";

const scopeV = v.object({ roomId: v.optional(v.string()), gameId: v.optional(v.string()), replay: v.optional(v.boolean()) });
const languageV = v.union(v.literal("typescript"), v.literal("python"));

async function seat(ctx: MutationCtx, userId: string, scope: Scope) {
  const r = await resolveContext(ctx, await userById(ctx, userId), scope);
  if (!r.game || !r.player) throw new OpFailure("Only players with a seat in this game can do this.");
  return { game: r.game, player: r.player };
}
/**
 * A domain failure crosses back to the action as a ConvexError carrying its words (the writes roll back); the action
 * turns it into the operation's failed outcome (`failureOf`).
 */
async function outcome<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    if (e instanceof OpFailure) throw new ConvexError({ message: e.message, ...(e.fix ? { fix: e.fix } : {}) });
    throw e;
  }
}

export const summon = internalMutation({
  args: { userId: v.string(), scope: scopeV, language: languageV, source: v.string(), name: v.optional(v.string()), share: v.optional(v.number()) },
  handler: (ctx, a) => outcome(async () => {
    const { game, player } = await seat(ctx, a.userId, a.scope);
    return await summonAgent(ctx, game, player, a);
  }),
});

export const reprogramAgent = internalMutation({
  args: { userId: v.string(), scope: scopeV, agentId: v.string(), language: v.optional(languageV), source: v.optional(v.string()), version: v.optional(v.number()) },
  handler: (ctx, a) => outcome(async () => {
    const { game, player } = await seat(ctx, a.userId, a.scope);
    const agent = await ownAgent(ctx, player, a.agentId);
    if (a.version !== undefined) {
      const p = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", a.version!)).unique();
      if (!p) throw new OpFailure(`That agent has no version ${a.version}.`);
      return await reprogram(ctx, game, player, agent, { language: p.language, source: p.source, kind: "putBack", from: a.version });
    }
    return await reprogram(ctx, game, player, agent, { language: a.language!, source: a.source!, kind: "replace" });
  }),
});

/** The OpFailure a transactional half reported, or the error itself. */
export function failureOf(e: unknown): unknown {
  const d = e instanceof ConvexError ? e.data as { message?: unknown; fix?: unknown } : null;
  return d && typeof d.message === "string" ? new OpFailure(d.message, typeof d.fix === "string" ? d.fix : undefined) : e;
}
