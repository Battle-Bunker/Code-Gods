/**
 * Model-backed AI players (integration plan §4.3, M3): an AI seat takes a turn every AI_TURN_MS while its game runs,
 * at most MAX_TURNS a game, each one model run (lib/v2-ai runAssistant) whose tools are the affordance directory's
 * assistant tools for the seat's context, performed through the same `<verb>As` functions an assistant or MCP client
 * calls, as the AI's principal (`member:<id>`). Spending is held to the seat's allowance per game (v2/ai.ts).
 */
import { disclosed } from "./disclose";
import { affordanceForTool, assistantTools, type AffordanceContext } from "@workspace/v2-affordances";
import type { Delegate } from "@workspace/v2-affordances/convex";
import { aiSeatSystemPrompt, commitmentBriefing, commitmentsOf, runAssistant, type ChatRow, type MoveRow } from "@workspace/v2-ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "../_generated/server";
import { AI_PRINCIPAL } from "./access";
import { OpFailure } from "@workspace/v2-affordances";
import { providerFor, spendWithin } from "./ai";
import { performAs } from "./perform";
import { startersFor } from "@workspace/v2-agents/pure";

export const AI_TURN_MS = 20_000;
/** Turns that ran (a paused game's skipped turns do not count): about ten minutes of play. */
export const MAX_TURNS = 30;

const INFO = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, Info | null>("v2/aiTurn:info");
const RESOLVE = makeFunctionReference<"query", Record<string, unknown>, { ctx: AffordanceContext }>("v2/ops/define:resolveCaller");
const TURN = makeFunctionReference<"action", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; n: number }>("v2/aiTurn:turn");

type Info = { phase: string; roomId: string; name: string; card: string; family: string | null; tieBreaker: string | null; energy: number; agents: number; worldSeconds: number };

export const info = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }): Promise<Info | null> => {
    const game = await ctx.db.get(gameId), member = await ctx.db.get(memberId);
    if (!game || !member || member.kind !== "ai") return null;
    const rule = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    const player = await ctx.db.query("v2Players").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    const clock = await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
    return { phase: game.phase, roomId: game.roomId, name: member.name, card: rule?.card ?? "", family: rule?.family ?? null, tieBreaker: rule?.tieBreaker ?? null, energy: player?.energy ?? 0, agents: player?.agents ?? 0, worldSeconds: clock?.worldSeconds ?? 0 };
  },
});

/** Rows read for the deals ledger: the room's latest chat, and each player's latest moves. */
const CHAT_ROWS = 120, MOVE_ROWS = 120;
const DEALS = makeFunctionReference<"query", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }, Deals | null>("v2/aiTurn:deals");
type Deals = { me: string; chat: ChatRow[]; moves: MoveRow[]; programs: string[] };

/**
 * What the seat's deals ledger reads (lib/v2-ai commitments): the game's chat, with its wall times turned into world
 * seconds; the moves that lowered a player's points, by mover and line; and the seat's live agents' programs.
 */
export const deals = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }): Promise<Deals | null> => {
    const game = await ctx.db.get(gameId);
    const me = game?.roster.find(r => r.memberId === memberId);
    if (!game || !me) return null;
    const names = new Map(game.roster.map(r => [r.memberId as string, r.name]));
    const clock = await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
    // World time runs to endsAt (tick.ts); while paused it stands still at the clock's.
    const worldAt = (at: number) => game.endsAt !== undefined ? game.settings.worldSeconds - (game.endsAt - at) / 1000 : Math.min(clock?.worldSeconds ?? 0, (clock?.worldSeconds ?? 0) - (Date.now() - at) / 1000);
    const since = game.createdAt;   // deals struck while planning count too
    const chat = (await ctx.db.query("v2Chat").withIndex("by_room", q => q.eq("roomId", game.roomId).gte("at", since)).order("desc").take(CHAT_ROWS))
      .reverse().map(m => ({ from: m.from, text: m.text, at: worldAt(m.at) }));
    // A row is the move as one player saw it: it lowered them when their points fell and someone else moved.
    const moves: MoveRow[] = [];
    for (const r of game.roster) {
      const rows = await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", gameId).eq("memberId", r.memberId)).order("desc").take(MOVE_ROWS);
      // On the points as disclosed (disclose.ts): the noisy others' sums while live, as the players saw them.
      for (const m of rows) if (m.by && m.by !== r.memberId && disclosed(game, m.after).points < disclosed(game, m.before).points)
        moves.push({ by: names.get(m.by) ?? "", line: m.number, at: m.worldSeconds, lowered: [r.name] });
    }
    const agents = await ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).collect();
    return { me: me.name, chat, moves, programs: agents.filter(a => a.destroyedAt === undefined).map(a => a.source) };
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
    // Its rule's Simple starter to begin from (and edit to honour deals: agent.programs → check → replace). Simple only,
    // since every turn pays for the prompt.
    const starters = seat.family ? startersFor(seat.family, "typescript", seat.tieBreaker).filter(s => s.kind === "simple").map(s => ({ title: s.title, summary: s.summary, language: "typescript", source: s.source })) : [];
    const ledger = await ctx.runQuery(DEALS, { gameId, memberId });
    const briefing = `Turn ${n + 1} of ${MAX_TURNS}. The game is ${seat.phase}${seat.phase === "live" ? ` at ${Math.round(seat.worldSeconds)} s` : ""}. ` +
      `You have ${Math.round(seat.energy)} ⚡ in your own store and ${seat.agents} agent(s). Act, then stop.`
      + (ledger ? `\n\n${commitmentBriefing(commitmentsOf(ledger.me, ledger.chat, ledger.moves, ledger.programs, 2 * AI_TURN_MS / 1000))}` : "");
    try {
      await spendWithin(ctx, { roomId: seat.roomId as Id<"v2Rooms">, gameId, memberId, pool: "ai" }, budget => runAssistant({
        provider: providerFor("seat"), system: aiSeatSystemPrompt({ name: seat.name, rule: seat.card, affordances: tools, starters }),
        messages: [{ role: "user", content: briefing }], tools, maxSteps: 6, budget,
        perform: (name, args) => performAs(ctx, delegate, { gameId }, affordanceForTool(name)!.id, args),
      }));
    } catch (e) {
      // Refused before any call (a quota, a ceiling, the rate limit, no model, not an administrator's room): the seat
      // waits and asks again next turn, uncounted, since the owner may raise a quota mid-game. A failure is logged.
      if (e instanceof OpFailure) { console.warn(`v2 AI player ${memberId} waits: ${e.message}`); await schedule(n); return; }
      console.error(`v2 AI turn failed (${memberId}): ${(e as Error).message}`);
    }
    await schedule(n + 1);
  },
});
