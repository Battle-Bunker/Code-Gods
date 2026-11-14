/** `agents.list`: the caller's agents with their energy. */
import { defineOp, seated } from "./define";
import { MAX_AGENTS } from "../play";

export const { op: list, as: listAs } = defineOp("agents.list", "query", async env => {
  const { game, member } = seated(env);
  const rows = await env.ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).take(MAX_AGENTS);
  const agents = [];
  for (const a of rows) {
    if (a.destroyedAt !== undefined) continue;
    const e = await env.ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", a._id)).unique();
    agents.push({ agentId: a._id, name: a.name, language: a.language, share: a.share, energy: e?.energy ?? 0, acts: e?.acts ?? 0, version: a.version });
  }
  return { agents };
});
