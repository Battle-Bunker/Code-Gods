/**
 * `agent.*`: checking, summoning, replacing, putting back and destroying an agent. Check runs the program in the
 * sandbox; summon, replace and put back are actions whose writes are one internal mutation each (commands.ts).
 */
import { OpFailure } from "@workspace/v2-affordances";
import { makeFunctionReference } from "convex/server";
import { destroyAgent, ownAgent } from "../agents.ts";
import { failureOf } from "../commands";
import { MAX_AGENTS } from "../play";
import { callerOf, defineOp, seated } from "./define";

const SUMMON = makeFunctionReference<"mutation", Record<string, unknown>, { agentId: string; price: number }>("v2/commands:summon");
const REPROGRAM = makeFunctionReference<"mutation", Record<string, unknown>, { version: number; price: number }>("v2/commands:reprogramAgent");
const CHECK = makeFunctionReference<"action", Record<string, unknown>, unknown>("v2/checkNode:check");

async function guarded<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { throw failureOf(e); }
}

export const { op: programs, as: programsAs } = defineOp("agent.programs", "query", async (env, a) => {
  const { member } = seated(env);
  const id = env.ctx.db.normalizeId("v2Agents", a.agentId);
  const agent = id ? await env.ctx.db.get(id) : null;
  if (!agent || agent.memberId !== member._id) throw new OpFailure("That agent is not yours.");
  const rows = await env.ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id)).order("desc").take(MAX_AGENTS);
  return { versions: rows.map(p => ({ version: p.version, language: p.language, source: p.source, acts: p.acts })) };
});

export const { op: check, as: checkAs } = defineOp("agent.check", "action", async (env, a) => {
  const c = callerOf(env);
  return await env.ctx.runAction(CHECK, { userId: c.userId!, scope: c.scope, language: a.language, source: a.source }) as never;
});

export const { op: summon, as: summonAs } = defineOp("agent.summon", "action", async (env, a) => {
  const c = callerOf(env);
  return await guarded(() => env.ctx.runMutation(SUMMON, { userId: c.userId!, scope: c.scope, language: a.language, source: a.source, ...(a.name ? { name: a.name } : {}), ...(a.share !== undefined ? { share: a.share } : {}) }));
});

export const { op: replace, as: replaceAs } = defineOp("agent.replace", "action", async (env, a) => {
  const c = callerOf(env);
  return await guarded(() => env.ctx.runMutation(REPROGRAM, { userId: c.userId!, scope: c.scope, agentId: a.agentId, language: a.language, source: a.source }));
});

export const { op: putBack, as: putBackAs } = defineOp("agent.putBack", "action", async (env, a) => {
  const c = callerOf(env);
  return await guarded(() => env.ctx.runMutation(REPROGRAM, { userId: c.userId!, scope: c.scope, agentId: a.agentId, version: a.version }));
});

export const { op: destroy, as: destroyAs } = defineOp("agent.destroy", "mutation", async (env, a) => {
  const { game, player } = seated(env);
  await destroyAgent(env.ctx, game, player, await ownAgent(env.ctx, player, a.agentId));
  return { ok: true as const };
});
