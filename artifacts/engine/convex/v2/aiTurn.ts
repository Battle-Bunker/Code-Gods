/**
 * Model-backed AI players (integration plan §4.3, M3): an AI seat takes a turn every AI_TURN_MS while its game runs,
 * at most MAX_TURNS a game, each one model run (lib/v2-ai runAssistant) whose tools are the affordance directory's
 * assistant tools for the seat's context, performed through the same `<verb>As` functions an assistant or MCP client
 * calls, as the AI's principal (`member:<id>`). Spending is held to the seat's allowance per game (v2/ai.ts).
 */
import { affordanceForTool, assistantTools, opKind, type AffordanceContext } from "@workspace/v2-affordances";
import { opPath, outcomeOf } from "@workspace/v2-affordances/convex";
import { aiSeatSystemPrompt, runAssistant } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import { AI_PRINCIPAL } from "./access";
import { budgetOf, providerFor, tokensOf } from "./ai";

export const AI_TURN_MS = 20_000;
export const MAX_TURNS = 8;

const INFO = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, Info | null>("v2/aiTurn:info");
const RESOLVE = makeFunctionReference<"query", Record<string, unknown>, { ctx: AffordanceContext }>("v2/ops/define:resolveCaller");
const USAGE = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, { tokens: number; usd: number } | null>("v2/ai:usageOf");
const RECORD = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; tokens: number; usd: number }>("v2/ai:record");
const TURN = makeFunctionReference<"action", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; n: number }>("v2/aiTurn:turn");

type Info = { phase: string; roomId: string; name: string; card: string; energy: number; agents: number; worldSeconds: number };

export const info = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }): Promise<Info | null> => {
    const game = await ctx.db.get(gameId), member = await ctx.db.get(memberId);
    if (!game || !member || member.kind !== "ai") return null;
    const rule = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    const player = await ctx.db.query("v2Players").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    const clock = await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
    return { phase: game.phase, roomId: game.roomId, name: member.name, card: rule?.card ?? "", energy: player?.energy ?? 0, agents: player?.agents ?? 0, worldSeconds: clock?.worldSeconds ?? 0 };
  },
});

/** Runs one affordance as the AI player, as an assistant would: the outcome's result, or a throw with its words. */
async function perform(ctx: ActionCtx, delegate: Record<string, unknown>, gameId: string, toolName: string, args: unknown) {
  const a = affordanceForTool(toolName);
  if (!a || a.runs !== "server") throw new Error(`No tool ${toolName}`);
  const ref = makeFunctionReference(opPath(a.id).internal) as never, input = { args, gameId, delegate } as never;
  let out: { ok: boolean; result?: unknown; error?: { message: string; fix?: string } };
  try {
    const kind = opKind(a);
    out = kind === "query" ? await ctx.runQuery(ref, input) : kind === "mutation" ? await ctx.runMutation(ref, input) : await ctx.runAction(ref, input);
  } catch (e) {
    const o = outcomeOf(e);
    if (!o) throw e;
    out = o as typeof out;
  }
  if (!out.ok) throw new Error(`${out.error!.message}${out.error!.fix ? ` (${out.error!.fix})` : ""}`);
  return out.result;
}

export const turn = internalAction({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members"), n: v.number() },
  handler: async (ctx, { gameId, memberId, n }) => {
    const seat = await ctx.runQuery(INFO, { gameId, memberId });
    if (!seat || seat.phase === "ended") return;
    const next = () => n + 1 < MAX_TURNS ? ctx.scheduler.runAfter(AI_TURN_MS, TURN, { gameId, memberId, n: n + 1 }) : null;
    if (seat.phase === "paused") { await next(); return; }
    const delegate = { userId: `${AI_PRINCIPAL}${memberId}`, roomId: seat.roomId, grant: "act", via: "assistant" };
    const caller = await ctx.runQuery(RESOLVE, { who: { delegate }, scope: { gameId } });
    // Server operations only, and nothing that spends the AI budget itself.
    const tools = assistantTools(caller.ctx).filter(t => { const a = affordanceForTool(t.name); return a?.runs === "server" && a.spends !== "aiBudget"; });
    let budget;
    try { budget = budgetOf(await ctx.runQuery(USAGE, { gameId, memberId })); } catch { return; }   // allowance used up: no more turns
    const briefing = `Turn ${n + 1} of ${MAX_TURNS}. The game is ${seat.phase}${seat.phase === "live" ? ` at ${Math.round(seat.worldSeconds)} s` : ""}. ` +
      `You have ${Math.round(seat.energy)} ⚡ in your own store and ${seat.agents} agent(s). Act, then stop.`;
    try {
      const run = await runAssistant({
        provider: providerFor(), system: aiSeatSystemPrompt({ name: seat.name, rule: seat.card, affordances: tools }),
        messages: [{ role: "user", content: briefing }], tools, maxSteps: 6, budget,
        perform: (name, args) => perform(ctx, delegate, gameId, name, args),
      });
      await ctx.runMutation(RECORD, { gameId, memberId, tokens: tokensOf(run.usage), usd: run.usd });
    } catch (e) {
      console.error(`v2 AI turn failed (${memberId}): ${(e as Error).message}`);
    }
    await next();
  },
});
