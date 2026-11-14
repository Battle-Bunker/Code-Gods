/** `pitch.draft`: the negotiation aid (owner decision 9): one model call drafting a cooperation pitch for chat.send. */
import { OpFailure } from "@workspace/v2-affordances";
import { pitchDraft } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import { budgetOf, providerFor, tokensOf } from "../ai";
import { callerOf, defineOp } from "./define";

type Context = { gameId: Id<"v2Games">; memberId: Id<"v2Members">; card: string; players: { name: string }[] } | null;
const CONTEXT = makeFunctionReference<"query", Record<string, unknown>, Context>("v2/ai:pitchContext");
const USAGE = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, { tokens: number; usd: number } | null>("v2/ai:usageOf");
const RECORD = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; tokens: number; usd: number }>("v2/ai:record");

export const { op: draft, as: draftAs } = defineOp("pitch.draft", "action", async (env, a) => {
  const c = callerOf(env);
  const context = await env.ctx.runQuery(CONTEXT, { userId: c.userId!, scope: c.scope, ...(a.to ? { to: a.to } : {}) });
  if (!context) throw new OpFailure("Only players with a seat in this game can do this.");
  const budget = budgetOf(await env.ctx.runQuery(USAGE, { gameId: context.gameId, memberId: context.memberId }));
  const out = await pitchDraft({ provider: providerFor(), myCard: context.card, players: context.players, ...(a.aim ? { aim: a.aim } : {}), budget });
  await env.ctx.runMutation(RECORD, { gameId: context.gameId, memberId: context.memberId, tokens: tokensOf(out.usage), usd: out.usd });
  return { draft: out.draft };
});
