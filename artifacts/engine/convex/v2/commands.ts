/**
 * The transactional halves of the action affordances (agent.summon, agent.replace, agent.putBack): the action
 * (ops/agent.ts) has checked the caller through `defineOp`; these resolve the seat again in their own transaction and
 * pay and write. Internal: reached only through the ops.
 */
import { assertTurnRuns } from "./turnFence";
import { OpFailure } from "@workspace/v2-affordances";
import { v } from "convex/values";
import { outcome } from "./failure";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { resolveContext, userById, type Scope } from "./access";
import { ownAgent, reprogram, summonAgent } from "./agents.ts";
import { setLeave } from "@workspace/v2-agents/pure";

const scopeV = v.object({ roomId: v.optional(v.string()), gameId: v.optional(v.string()), replay: v.optional(v.boolean()) });
const languageV = v.union(v.literal("typescript"), v.literal("python"));

async function seat(ctx: MutationCtx, userId: string, scope: Scope) {
  const r = await resolveContext(ctx, await userById(ctx, userId), scope);
  if (!r.game || !r.player) throw new OpFailure("Only players with a seat in this game can do this.");
  return { game: r.game, player: r.player };
}
export const summon = internalMutation({
  args: { userId: v.string(), scope: scopeV, turnId: v.optional(v.string()), language: languageV, source: v.string(), name: v.optional(v.string()), share: v.optional(v.number()) },
  handler: (ctx, { turnId, ...a }) => outcome(async () => {
    await assertTurnRuns(ctx, turnId);
    const { game, player } = await seat(ctx, a.userId, a.scope);
    return await summonAgent(ctx, game, player, a);
  }),
});

export const reprogramAgent = internalMutation({
  args: { userId: v.string(), scope: scopeV, turnId: v.optional(v.string()), agentId: v.string(), language: v.optional(languageV), source: v.optional(v.string()), version: v.optional(v.number()), leave: v.optional(v.array(v.number())) },
  handler: (ctx, { turnId, ...a }) => outcome(async () => {
    await assertTurnRuns(ctx, turnId);
    const { game, player } = await seat(ctx, a.userId, a.scope);
    const agent = await ownAgent(ctx, player, a.agentId);
    if (a.leave !== undefined) {
      // agent.leaveAlone: the running program with only its leave-alone list changed (priced as that edit).
      const p = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id)).order("desc").first();
      const source = p ? setLeave(p.source, a.leave) : null;
      if (!p || source === null) throw new OpFailure("That agent's code has no leave-alone list (LEAVE) to set.", "Edit its code in Agent code, or replace it with a starter (Simple, Thorough, Bold), which has one.");
      return await reprogram(ctx, game, player, agent, { language: p.language, source, kind: "replace" });
    }
    if (a.version !== undefined) {
      const p = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", a.version!)).unique();
      if (!p) throw new OpFailure(`That agent has no version ${a.version}.`);
      return await reprogram(ctx, game, player, agent, { language: p.language, source: p.source, kind: "putBack", from: a.version });
    }
    return await reprogram(ctx, game, player, agent, { language: a.language!, source: a.source!, kind: "replace" });
  }),
});
