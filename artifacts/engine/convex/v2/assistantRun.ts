/**
 * The in-client assistant's run (v2/assistant.ts): one action per turn. It replays the thread, offers the directory's
 * assistant tools for the human's context (read tools only in read-only mode; never the assistant's own operations),
 * performs each call as the human's delegate (`via: "assistant"`, their chosen grant), and writes what it said and did.
 * A Stop is seen at the next tool call.
 */
import { assistantTools, affordanceForTool, type AffordanceContext } from "@workspace/v2-affordances";
import type { Delegate } from "@workspace/v2-affordances/convex";
import { assistantSystemPrompt, mergeTurns, runAssistant, textOf, type ChatMessage, type RunResult } from "@workspace/v2-ai";
import { startersFor } from "@workspace/v2-agents/pure";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalQuery } from "../_generated/server";
import { memberOf, ruleOf } from "./access";
import { providerFor, spendWithin } from "./ai";
import { LIMITS, type Grant, type Mode } from "./assistant";
import { performAs } from "./perform";

type Input = {
  roomId: string; userId: string; gameId: Id<"v2Games"> | null; memberId: Id<"v2Members">; name: string; grant: Grant; mode: Mode;
  trigger: "autopilot" | null; history: ChatMessage[]; rule: { card: string; family: string } | null;
} | null;
const INPUT = makeFunctionReference<"query", { turnId: Id<"v2AssistantTurns"> }, Input>("v2/assistantRun:turnInput");
const STATUS = makeFunctionReference<"query", { turnId: Id<"v2AssistantTurns"> }, string | null>("v2/assistantCore:turnStatus");
const CALL = makeFunctionReference<"mutation", { turnId: Id<"v2AssistantTurns">; index: number; tool: string; argsJson: string; ok: boolean; summary: string }>("v2/assistantCore:recordCall");
const FINISH = makeFunctionReference<"mutation", Record<string, unknown>>("v2/assistantCore:finish");
const RESOLVE = makeFunctionReference<"query", Record<string, unknown>, { ctx: AffordanceContext }>("v2/ops/define:resolveCaller");

/** A tool result kept in the thread at most this long (the model saw it whole). */
const RESULT_CHARS = 8 * 1024;

/** The tools a mode offers: never the assistant's own operations (a conversation does not drive itself). */
export function toolsFor(ctx: AffordanceContext, mode: Mode) {
  return assistantTools(ctx).filter(t => {
    const a = affordanceForTool(t.name);
    return !!a && !a.id.startsWith("assistant.") && (mode !== "readOnly" || a.effect === "read");
  });
}

/** A run's new messages as stored: tool results clipped (a later turn replays them). */
function stored(messages: readonly ChatMessage[]) {
  return messages.map(m => m.role === "assistant"
    ? { role: "assistant" as const, text: textOf(m.content), contentJson: JSON.stringify(m.content) }
    : { role: "tool" as const, text: "", contentJson: JSON.stringify(typeof m.content === "string" ? [{ type: "text", text: m.content }]
      : m.content.map(b => b.type === "tool_result" && b.content.length > RESULT_CHARS ? { ...b, content: `${b.content.slice(0, RESULT_CHARS)}… (cut)` } : b)) });
}

/** The history a turn replays, oldest first: whole exchanges, from a human message on. */
function historyOf(rows: Doc<"v2AssistantMessages">[]): ChatMessage[] {
  const first = rows.findIndex(r => r.role === "user");
  const out: ChatMessage[] = [];
  for (const r of first < 0 ? [] : rows.slice(first)) {
    if (r.role === "user") out.push({ role: "user", content: r.text });
    else if (r.contentJson) out.push({ role: r.role === "assistant" ? "assistant" : "user", content: JSON.parse(r.contentJson) } as ChatMessage);
  }
  // A turn that failed left a message unanswered: two of the human's in a row are one.
  return mergeTurns(out);
}

export const turnInput = internalQuery({
  args: { turnId: v.id("v2AssistantTurns") },
  handler: async (ctx, { turnId }) => {
    const turn = await ctx.db.get(turnId);
    if (!turn || turn.status !== "running") return null;
    const room = await ctx.db.get(turn.roomId), member = room ? await memberOf(ctx, room._id, turn.userId) : null;
    if (!room || !member) return null;
    const rows = (await ctx.db.query("v2AssistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", turn.threadId)).order("desc").take(LIMITS.historyMessages)).reverse();
    const rule = turn.gameId ? await ruleOf(ctx, turn.gameId, member._id) : null;
    return {
      roomId: turn.roomId as string, userId: turn.userId, gameId: turn.gameId ?? null, memberId: member._id, name: member.name,
      grant: turn.grant, mode: turn.mode, trigger: turn.trigger ?? null, history: historyOf(rows),
      rule: rule ? { card: rule.card, family: rule.family } : null,
    };
  },
});

export const run = internalAction({
  args: { turnId: v.id("v2AssistantTurns") },
  handler: async (ctx, { turnId }) => {
    const input = await ctx.runQuery(INPUT, { turnId });
    // Stopped before it began, or its human left the room: it ends without a word.
    if (!input) { await ctx.runMutation(FINISH, { turnId, messages: [], status: "cancelled", steps: 0, tokens: 0, usd: 0 }); return; }
    const abort = new AbortController();
    let index = 0, result: RunResult | null = null, error: string | undefined, status: "done" | "failed" | "cancelled" | "budget" = "done";
    try {
      const delegate: Delegate = { userId: input.userId, roomId: input.roomId, grant: input.grant, via: "assistant" };
      const scope = input.gameId ? { gameId: input.gameId as string } : {};
      const caller = await ctx.runQuery(RESOLVE, { who: { delegate }, scope });
      const tools = toolsFor(caller.ctx, input.mode);
      const starters = input.rule ? startersFor(input.rule.family, "typescript").slice(0, 1).map(s => ({ title: s.title, summary: s.summary, language: "typescript", source: s.source })) : [];
      const system = assistantSystemPrompt({ context: caller.ctx.context, playerName: input.name, ...(input.rule ? { rule: input.rule.card } : {}), affordances: tools, starters }) +
        (input.mode === "readOnly" ? "\n\nMODE. Read-only: answer and explain; you cannot change anything." : "");
      result = await spendWithin(ctx, { roomId: input.roomId as Id<"v2Rooms">, ...(input.gameId ? { gameId: input.gameId } : {}), memberId: input.memberId, pool: "assistant" }, budget => runAssistant({
        provider: providerFor(), system, messages: input.history, tools, budget, signal: abort.signal,
        maxSteps: input.trigger === "autopilot" ? LIMITS.autopilotSteps : LIMITS.maxSteps,
        perform: async (name, args) => {
          if (await ctx.runQuery(STATUS, { turnId }) !== "running") { abort.abort(); throw new Error("Stopped by the player."); }
          const n = index++;
          try {
            const out = await performAs(ctx, delegate, scope, affordanceForTool(name)!.id, args);
            await ctx.runMutation(CALL, { turnId, index: n, tool: name, argsJson: JSON.stringify(args), ok: true, summary: "done" });
            return out;
          } catch (e) {
            await ctx.runMutation(CALL, { turnId, index: n, tool: name, argsJson: JSON.stringify(args), ok: false, summary: (e as Error).message });
            throw e;
          }
        },
      }));
      if (result.stop === "budget") status = "budget";
    } catch (e) {
      status = abort.signal.aborted ? "cancelled" : "failed";
      error = abort.signal.aborted ? undefined : (e as Error).message;
    }
    const fresh = result ? result.messages.slice(input.history.length) : [];
    await ctx.runMutation(FINISH, {
      turnId, messages: stored(fresh), status, steps: result?.steps ?? 0,
      tokens: result ? result.usage.inputTokens + result.usage.outputTokens : 0, usd: result?.usd ?? 0, ...(error ? { error } : {}),
    });
  },
});
