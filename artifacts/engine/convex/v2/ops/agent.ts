/**
 * `agent.*`: checking, summoning, replacing, putting back and destroying an agent. Check, summon, replace and put back
 * are actions (they run the sandbox, W3-4); `agent.programs` reads the caller's own agent's versions.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { defineOp, notYet, seated } from "./define";
import { MAX_AGENTS } from "../play";

export const { op: programs, as: programsAs } = defineOp("agent.programs", "query", async (env, a) => {
  const { member } = seated(env);
  const id = env.ctx.db.normalizeId("v2Agents", a.agentId);
  const agent = id ? await env.ctx.db.get(id) : null;
  if (!agent || agent.memberId !== member._id) throw new OpFailure("That agent is not yours.");
  const rows = await env.ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id)).order("desc").take(MAX_AGENTS);
  return { versions: rows.map(p => ({ version: p.version, language: p.language, source: p.source, acts: p.acts })) };
});

export const { op: check, as: checkAs } = defineOp("agent.check", "action", () => notYet("W3-4"));
export const { op: summon, as: summonAs } = defineOp("agent.summon", "action", () => notYet("W3-4"));
export const { op: replace, as: replaceAs } = defineOp("agent.replace", "action", () => notYet("W3-4"));
export const { op: putBack, as: putBackAs } = defineOp("agent.putBack", "action", () => notYet("W3-4"));
export const { op: destroy, as: destroyAs } = defineOp("agent.destroy", "mutation", () => notYet("W3-4"));
