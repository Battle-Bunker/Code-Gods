/** `pitch.draft`: the negotiation aid (owner decision 9): one model call drafting a cooperation pitch for chat.send. */
import { OpFailure } from "@workspace/v2-affordances";
import { pitchDraft } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import { providerFor, spendWithin } from "../ai";
import { callerOf, defineOp } from "./define";

type Context = { gameId: Id<"v2Games">; memberId: Id<"v2Members">; card: string; players: { name: string }[] } | null;
const CONTEXT = makeFunctionReference<"query", Record<string, unknown>, Context>("v2/ai:pitchContext");

export const { op: draft, as: draftAs } = defineOp("pitch.draft", "action", async (env, a) => {
  const c = callerOf(env);
  const context = await env.ctx.runQuery(CONTEXT, { userId: c.userId!, scope: c.scope, ...(a.to ? { to: a.to } : {}) });
  if (!context) throw new OpFailure("Only players with a seat in this game can do this.");
  const out = await spendWithin(env.ctx, context.gameId, context.memberId, budget =>
    pitchDraft({ provider: providerFor(), myCard: context.card, players: context.players, ...(a.aim ? { aim: a.aim } : {}), budget }));
  return { draft: out.draft };
});
