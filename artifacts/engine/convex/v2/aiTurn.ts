/**
 * Model-backed AI players (integration plan §4.3, M3): an AI seat takes a turn every AI_TURN_MS while its game runs,
 * at most MAX_TURNS a game, each one model run (lib/v2-ai runAssistant) whose tools are the affordance directory's
 * assistant tools for the seat's context, performed through the same `<verb>As` functions an assistant or MCP client
 * calls, as the AI's principal (`member:<id>`). Spending is held to the seat's allowance per game (v2/ai.ts).
 */
import { affordanceForTool, assistantTools, type AffordanceContext } from "@workspace/v2-affordances";
import type { Delegate } from "@workspace/v2-affordances/convex";
import { aiSeatSystemPrompt, runAssistant } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import { AI_PRINCIPAL } from "./access";
import { OpFailure } from "@workspace/v2-affordances";
import { providerFor, spendWithin } from "./ai";
import { performAs } from "./perform";

export const AI_TURN_MS = 20_000;
/** Turns that ran (a paused game's skipped turns do not count): about ten minutes of play. */
export const MAX_TURNS = 30;

const INFO = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, Info | null>("v2/aiTurn:info");
const RESOLVE = makeFunctionReference<"query", Record<string, unknown>, { ctx: AffordanceContext }>("v2/ops/define:resolveCaller");
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

export const turn = internalAction({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members"), n: v.number() },
  handler: async (ctx, { gameId, memberId, n }) => {
    const seat = await ctx.runQuery(INFO, { gameId, memberId });
    if (!seat || seat.phase === "ended") return;
    const schedule = (k: number) => k < MAX_TURNS ? ctx.scheduler.runAfter(AI_TURN_MS, TURN, { gameId, memberId, n: k }) : null;
    if (seat.phase === "paused") { await schedule(n); return; }   // a paused turn does not count
    const delegate: Delegate = { userId: `${AI_PRINCIPAL}${memberId}`, roomId: seat.roomId, grant: "act", via: "assistant" };
    const caller = await ctx.runQuery(RESOLVE, { who: { delegate }, scope: { gameId } });
    // Server operations only, and nothing that spends the AI budget itself.
    const tools = assistantTools(caller.ctx).filter(t => { const a = affordanceForTool(t.name); return a?.runs === "server" && a.spends !== "aiBudget" && !a.id.startsWith("assistant.") && !a.id.startsWith("panel."); });
    const briefing = `Turn ${n + 1} of ${MAX_TURNS}. The game is ${seat.phase}${seat.phase === "live" ? ` at ${Math.round(seat.worldSeconds)} s` : ""}. ` +
      `You have ${Math.round(seat.energy)} ⚡ in your own store and ${seat.agents} agent(s). Act, then stop.`;
    try {
      await spendWithin(ctx, gameId, memberId, budget => runAssistant({
        provider: providerFor(), system: aiSeatSystemPrompt({ name: seat.name, rule: seat.card, affordances: tools }),
        messages: [{ role: "user", content: briefing }], tools, maxSteps: 6, budget,
        perform: (name, args) => performAs(ctx, delegate, { gameId }, affordanceForTool(name)!.id, args),
      }));
    } catch (e) {
      // The allowance used up, or no model on this deployment: this seat stops for the game. Anything else is logged
      // and the next turn tries again.
      if (e instanceof OpFailure) { console.warn(`v2 AI player ${memberId} stops: ${e.message}`); return; }
      console.error(`v2 AI turn failed (${memberId}): ${(e as Error).message}`);
    }
    await schedule(n + 1);
  },
});
