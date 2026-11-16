/** `agents.list`: a page of the caller's live agents with their energy (≤ 200 a player, call 35; pages ≤ 50). */
import { liveAgentsOf } from "../play";
import { pageOpts } from "../pages";
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("agents.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const page = await liveAgentsOf(env.ctx, game._id, member._id).paginate(pageOpts(pageOf(a)));
  const rows = [];
  for (const agent of page.page) {
    const e = await env.ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", agent._id)).unique();
    rows.push({ agentId: agent._id, name: agent.name, language: agent.language, share: agent.share, energy: e?.energy ?? 0, acts: e?.acts ?? 0, version: agent.version });
  }
  return { page: rows, nextCursor: page.isDone ? null : page.continueCursor };
});
