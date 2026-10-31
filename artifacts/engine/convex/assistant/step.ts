"use node";
/**
 * One step of an assistant turn (docs/surface-architecture.md §6), a scheduled Node action chained by generation:
 *
 *   1. resolve the current step's tool calls in order: run the automatic ones; stop at one that needs the player's
 *      confirmation (the turn waits with no action open; assistant:confirm schedules the next run);
 *   2. otherwise ask the model: reserve from the assistant pool, stream (flushing text about every 250 ms or 400
 *      characters through a mutation that also reports cancellation), settle the usage, record its tool calls;
 *   3. run those calls (step 1), then schedule the next step, or finish (model stop, step ceiling, deadline, budget).
 *
 * Before the turn's first model step, the briefing (the player's utility, energy, helpers, the room's rules and the
 * panes on their screen) is read through the same registry and stored with the turn. The model's blocks of each step are stored verbatim and replayed
 * in its history (rules.ts buildHistory), so Claude's thinking blocks stay valid across the turn's steps.
 *
 * Every tool runs through the agent registry as the turn's assistant credential (`runTool(ctx, {credentialId}, …)`):
 * there is no other path to game state. Command and request ids are UUIDv5 of (turn, call), never the model's.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import {
  ChatAbortedError, abortedOutputTokens, assistantBriefing, assistantSystemPrompt, createDirectAnthropicChatProvider, createDirectOpenAIChatProvider,
  inputReservation, mockChatProvider, providerFailure, usageCost, worstCaseCost,
  type ChatMessage, type ChatProvider, type ChatResult, type ChatToolUse, type Prices,
} from "@workspace/ai-player";
import { findTool, mayUse, type ToolResult } from "@workspace/player-client/tools";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { runTool, toolError } from "../agent/registry";
import type { Who } from "../agent/store";
import type { Reservation } from "../ai/seats";
import { AI_MODEL_CATALOG, DEFAULT_AGENT_MODEL, assistantMockEnabled } from "../lib/aiModels";
import { messageOf } from "../lib/errors";
import { LIMITS, callLimitProblem, clipJson, commandIdFor, modelTools, needsConfirmation, prepareArgs, summarize, argsLimit } from "./rules";
import { log } from "./store";

const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());

type Context = Exclude<Awaited<ReturnType<typeof loadContext>>, { stop: string }>;
type CallRow = Context["calls"][number];
const loadContext = (ctx: ActionCtx, turnId: Id<"assistantTurns">, gen: number) => ctx.runQuery(internal.assistant.store.context, { turnId, gen });

function providerFor(modelId: string | null): ChatProvider {
  if (assistantMockEnabled()) return mockChatProvider();
  const config = AI_MODEL_CATALOG.find(m => m.id === (modelId ?? DEFAULT_AGENT_MODEL));
  if (!config) throw new Error("The assistant's model is no longer offered");
  const key = (config.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
  if (!key) throw new Error(`The assistant is not set up on this server yet: whoever runs it has to add an ${config.provider} API key. Until then, the command palette does everything the assistant would.`);
  const { inputUsdPerMillion, outputUsdPerMillion, cacheReadUsdPerMillion, cacheWriteUsdPerMillion } = config as typeof config & Prices;
  const prices: Prices = { inputUsdPerMillion, outputUsdPerMillion, cacheReadUsdPerMillion, ...(cacheWriteUsdPerMillion ? { cacheWriteUsdPerMillion } : {}) };
  return config.provider === "anthropic"
    ? createDirectAnthropicChatProvider(key, { model: config.id, ...prices })
    : createDirectOpenAIChatProvider(key, config.id, prices);
}

/** The cost a validate_agent call of this turn reported for exactly this source and language (for auto-approved summons). */
function validatedCost(calls: CallRow[], args: Record<string, unknown>): number | undefined {
  for (const c of calls) {
    if (c.tool !== "validate_agent" || c.status !== "ok" || !c.resultJson) continue;
    try {
      const validated = JSON.parse(c.argsJson) as { source?: unknown; language?: unknown; gameId?: unknown };
      if (validated.source !== args.source || validated.language !== args.language || validated.gameId !== args.gameId) continue;
      const result = JSON.parse(c.resultJson) as { data?: { receipt?: { accepted?: boolean; validation?: { valid?: boolean; cost?: number } } } };
      const validation = result.data?.receipt?.validation;
      if (result.data?.receipt?.accepted && validation?.valid && typeof validation.cost === "number") return validation.cost;
    } catch { /* not a usable validation */ }
  }
  return undefined;
}

/**
 * The player's situation for the turn's briefing, read as the turn's credential like any tool call: the room's rules
 * and the observation (absent in the lobby or when a read fails; the briefing says so).
 */
async function briefingFor(ctx: ActionCtx, credentialId: Context["turn"]["credentialId"]): Promise<string> {
  const read = async (tool: string, args: Record<string, unknown>) => {
    try { return (await runTool(ctx, { credentialId }, tool, args)).data; } catch { return undefined; }
  };
  const [rules, observation, layout] = await Promise.all([read("get_rules", {}), read("get_observation", { objectsLimit: 1 }), read("get_layout", {})]);
  return assistantBriefing({ rules, observation, layout });
}

/**
 * Resolve the step's open tool calls in order. Returns "paused" (waiting for a confirmation), "cancelled", or
 * "resolved" (every call has an outcome).
 */
async function resolveCalls(ctx: ActionCtx, turnId: Id<"assistantTurns">, gen: number, c: Context, who: Who | null): Promise<"paused" | "cancelled" | "resolved"> {
  const principal = { credentialId: c.turn.credentialId };
  for (const call of [...c.calls].sort((a, b) => a.index - b.index)) {
    if (call.status === "ok" || call.status === "error" || call.status === "denied") continue;
    if (call.status === "awaiting_confirmation") return "paused";
    const args = JSON.parse(call.argsJson) as Record<string, unknown>;
    const definition = findTool(call.tool);
    const permitted = !!definition && !!who && mayUse(who.permission, definition);
    if (permitted && !call.approved && needsConfirmation(call.tool, args, { autoApproveSummonBits: c.autoApproveSummonBits, validatedCost: validatedCost(c.calls, args) })) {
      const { cancelled } = await ctx.runMutation(internal.assistant.store.awaitConfirmation, { turnId, gen, callDocId: call.id });
      return cancelled ? "cancelled" : "paused";
    }
    const start = await ctx.runMutation(internal.assistant.store.startCall, { turnId, gen, callDocId: call.id });
    if (start.cancelled) return "cancelled";
    if (!start.go) continue;
    let outcome: { status: "ok" | "error"; summary: string; resultJson: string };
    try {
      const result: ToolResult = await runTool(ctx, principal, call.tool, args);
      outcome = { status: "ok", summary: summarize(call.tool, result), resultJson: clipJson(result, LIMITS.resultChars) };
    } catch (error) {
      const e = toolError(error);
      outcome = { status: "error", summary: `${e.code}: ${e.message}`.slice(0, 200), resultJson: clipJson({ error: e }, LIMITS.resultChars) };
    }
    log("tool", { turnId, tool: call.tool, outcome: outcome.status });
    const end = await ctx.runMutation(internal.assistant.store.endCall, { turnId, gen, callDocId: call.id, ...outcome });
    if (end.cancelled) return "cancelled";
    call.status = outcome.status;
    call.resultJson = outcome.resultJson;
  }
  return "resolved";
}

/**
 * A text flusher: about every LIMITS.flushMs or LIMITS.flushChars, one write in flight at a time. Each write reports
 * cancellation; while no new text streams (a tool-use answer, a silent stretch) it checks about once a second.
 */
function flusher(ctx: ActionCtx, turnId: Id<"assistantTurns">, gen: number, messageId: Id<"assistantMessages">, onCancel: () => void) {
  let text = "", flushedLength = 0, lastAt = Date.now();
  let inFlight: Promise<void> | null = null;
  const track = (p: Promise<{ cancelled: boolean }>, after: () => void) => {
    inFlight = p.then(({ cancelled }) => { after(); if (cancelled) onCancel(); })
      .catch(() => { /* the final write carries the text */ })
      .finally(() => { inFlight = null; });
  };
  const flushNow = () => {
    if (inFlight) return;
    lastAt = Date.now();
    if (text.length === flushedLength) return track(ctx.runQuery(internal.assistant.store.live, { turnId, gen }).then(live => ({ cancelled: !live })), () => {});
    const snapshot = text;
    track(ctx.runMutation(internal.assistant.store.flush, { turnId, gen, messageId, text: snapshot }), () => { flushedLength = snapshot.length; });
  };
  const timer = setInterval(() => {
    const idle = Date.now() - lastAt;
    if ((text.length !== flushedLength && idle >= LIMITS.flushMs) || idle >= 1000) flushNow();
  }, LIMITS.flushMs / 2);
  return {
    push(delta: string) { text += delta; if (text.length - flushedLength >= LIMITS.flushChars || Date.now() - lastAt >= LIMITS.flushMs) flushNow(); },
    async stop() { clearInterval(timer); if (inFlight) await inFlight; },
  };
}

export const run = internalAction({
  args: { turnId: v.id("assistantTurns"), gen: v.number() },
  handler: async (ctx, { turnId, gen }): Promise<void> => {
    const finish = (status: "done" | "failed" | "budget_exhausted" | "cancelled", error?: { code: string; message: string }) =>
      ctx.runMutation(internal.assistant.store.finish, { turnId, gen, status, ...(error ? { error } : {}) });
    let c = await loadContext(ctx, turnId, gen);
    if ("stop" in c) {
      // A cancelled turn whose step was only scheduled: acknowledge the cancellation.
      if (c.stop === "stale" && c.status === "cancelling") await finish("cancelled");
      return;
    }
    if (Date.now() > c.turn.deadline) return void await finish("failed", { code: "DEADLINE", message: "The turn ran past its 10-minute deadline" });
    const who: Who | null = await ctx.runQuery(internal.agent.store.principalInfo, { credentialId: c.turn.credentialId });

    // 1. The current step's tool calls.
    if (c.calls.some(call => call.status !== "ok" && call.status !== "error" && call.status !== "denied")) {
      const resolved = await resolveCalls(ctx, turnId, gen, c, who);
      if (resolved === "cancelled") return void await finish("cancelled");
      if (resolved === "paused") return;
      await ctx.runMutation(internal.assistant.store.next, { turnId, gen });
      return;
    }
    if (c.turn.lastStop === "end_turn") return void await finish("done");
    if (c.turn.step >= c.turn.maxSteps) return void await finish("done", { code: "STEP_LIMIT", message: `Stopped after ${c.turn.maxSteps} steps; ask again to continue.` });
    if (!who) return void await finish("failed", { code: "UNAUTHENTICATED", message: "The assistant's credential was revoked or has expired." });

    // 2. One model step. The first one fetches the briefing (kept for the whole turn, so its history stays append-only).
    if (!c.hasBriefing) {
      const { cancelled } = await ctx.runMutation(internal.assistant.store.setBriefing, { turnId, gen, briefing: await briefingFor(ctx, c.turn.credentialId) });
      if (cancelled) return void await finish("cancelled");
      const reloaded = await loadContext(ctx, turnId, gen);
      if ("stop" in reloaded) { if (reloaded.stop === "stale" && reloaded.status === "cancelling") await finish("cancelled"); return; }
      c = reloaded;
    }
    let provider: ChatProvider;
    try { provider = providerFor(c.model); } catch (error) { return void await finish("failed", { code: "UNAVAILABLE", message: messageOf(error) }); }
    const tools = modelTools(who.permission);
    const system = assistantSystemPrompt({ playerName: c.playerName, roomCode: c.roomCode, permission: who.permission });
    const messages = JSON.parse(c.historyJson) as ChatMessage[];
    // The reservation: the request's estimated input (a provider count, else a measured characters-per-token ratio),
    // with a margin, at its dearest price (all written to the prompt cache), plus the output ceiling. Settled to the
    // actual usage afterwards, so it only decides whether the allowance has room for the step.
    const estimate = await provider.estimateInputTokens({ system, messages, tools });
    const inputBound = inputReservation(estimate);
    const outputBound = LIMITS.maxOutputTokens;
    const worst = worstCaseCost(provider.prices, inputBound, outputBound);
    const reservation: Reservation = await ctx.runMutation(internal.ai.seats.reserve, {
      pool: "assistant", roomId: c.roomId, subject: c.turn.subject, tokens: worst.tokens, usd: worst.usd,
    });
    if (!reservation.ok) {
      log("budget", { turnId, reason: reservation.reason });
      if (reservation.reason === "rate" && Date.now() + (reservation.retryAfterMs ?? 0) < c.turn.deadline) {
        await ctx.runMutation(internal.assistant.store.next, { turnId, gen, delayMs: reservation.retryAfterMs });
        return;
      }
      return void await finish("budget_exhausted", { code: reservation.reason.toUpperCase(), message: reservation.message });
    }
    const messageId = await ctx.runMutation(internal.assistant.store.openStep, {
      turnId, gen, tools: tools.map(t => t.name), reservedTokens: reservation.reservedTokens, reservedUsd: reservation.reservedUsd, inputEstimate: estimate.tokens,
    });
    if (!messageId) return void await finish("cancelled");
    const settle = (cost: { tokens: number; usd: number }, usage: { inputTokens: number; outputTokens: number }) => ctx.runMutation(internal.ai.seats.settle, {
      pool: "assistant", roomId: c.roomId, subject: c.turn.subject, epoch: reservation.epoch, reservedTokens: reservation.reservedTokens,
      ...usage, tokens: cost.tokens, reservedUsd: reservation.reservedUsd, usd: cost.usd,
    });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), Math.max(1000, c.turn.deadline - Date.now()));
    const flush = flusher(ctx, turnId, gen, messageId, () => abort.abort());
    let result: ChatResult;
    try {
      result = await provider.stream({ system, messages, tools, maxOutputTokens: outputBound, signal: abort.signal, onText: d => flush.push(d), cacheKey: createHash("sha256").update(`assistant-thread:${c.threadId}`).digest("hex").slice(0, 32) });
    } catch (error) {
      await flush.stop();
      clearTimeout(timeout);
      if (error instanceof ChatAbortedError && abort.signal.aborted) {
        // A cancelled (or timed-out) stream reports no usage. Bill the best known: the input the provider reported
        // when the stream opened, else the estimate at its dearest price; the output the streamed text and reasoning
        // time bound. Never more than the reservation.
        const { partial } = error;
        const outputTokens = abortedOutputTokens(partial, outputBound);
        const cost = partial.input ? usageCost(provider.prices, { ...partial.input, outputTokens }) : worstCaseCost(provider.prices, estimate.tokens, outputTokens);
        const billed = { tokens: Math.min(cost.tokens, reservation.reservedTokens), usd: Math.min(cost.usd, reservation.reservedUsd) };
        const inputTokens = partial.input?.inputTokens ?? estimate.tokens;
        log("step", { turnId, step: c.turn.step, outcome: "aborted", billedTokens: billed.tokens, reservedTokens: reservation.reservedTokens,
          input: partial.input ? "reported" : estimate.counted ? "counted" : "estimated", inputTokens, outputTokens, outputBasis: "streamed text and reasoning time" });
        await settle(billed, { inputTokens, outputTokens }).catch(() => log("budget", { turnId, reason: "settle_failed" }));
        await ctx.runMutation(internal.assistant.store.recordAbortedUsage, {
          turnId, messageId, inputTokens, outputTokens, cacheReadTokens: partial.input?.cacheReadTokens ?? 0, cacheWriteTokens: partial.input?.cacheWriteTokens ?? 0, billedTokens: billed.tokens,
        });
        return void await finish("cancelled");
      }
      log("step", { turnId, step: c.turn.step, outcome: abort.signal.aborted ? "aborted" : "provider_error" });
      // A provider failure, or a cancellation the flush saw (finish turns a cancelling turn into cancelled, never
      // failed). A request the provider refused outright (an HTTP error status) cost nothing, so its reservation is
      // released (best effort: the turn finishes either way); any other failure has no trustworthy usage and keeps it.
      const failure = providerFailure(error);
      if (failure.unbilled && !abort.signal.aborted) {
        await settle({ tokens: 0, usd: 0 }, { inputTokens: 0, outputTokens: 0 }).catch(() => log("budget", { turnId, reason: "release_failed" }));
      }
      return void await finish("failed", { code: "MODEL", message: failure.message });
    }
    await flush.stop();
    clearTimeout(timeout);
    // The actual usage, even past the reservation (a low estimate): the allowance keeps what the call cost.
    const cost = usageCost(provider.prices, result);
    await settle(cost, { inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    log("step", { turnId, step: c.turn.step, outcome: result.stopReason, inputTokens: result.inputTokens, cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens, outputTokens: result.outputTokens, billedTokens: cost.tokens, inputEstimate: estimate.tokens, counted: estimate.counted });
    const text = result.content.filter(b => b.type === "text").map(b => b.text).join("");
    // Every tool use gets a call row (and so a result): the step's blocks are replayed verbatim.
    const uses = result.content.filter((b): b is ChatToolUse => b.type === "tool_use");
    const calls = uses.map((use, n) => {
      const id = commandIdFor(turnId, use.id, sha1);
      const args = prepareArgs(use.name, use.input, id);
      const argsJson = JSON.stringify(args);
      const ids = args.commandId === id || args.requestId === id ? { commandId: id } : {};
      const limited = callLimitProblem(use.name, uses.slice(0, n).map(u => u.name));
      if (limited) {
        return { callId: use.id, tool: use.name, argsJson: clipJson(args, LIMITS.argsChars), ...ids, status: "error" as const, summary: "Too many calls in one step",
          resultJson: JSON.stringify({ error: { code: "BAD_REQUEST", message: limited } }) };
      }
      if (argsJson.length > argsLimit(use.name)) {
        return { callId: use.id, tool: use.name, argsJson: clipJson(args, LIMITS.argsChars), ...ids, status: "error" as const, summary: "Arguments too large",
          resultJson: JSON.stringify({ error: { code: "BAD_REQUEST", message: `Tool arguments are limited to ${argsLimit(use.name)} characters` } }) };
      }
      return { callId: use.id, tool: use.name, argsJson, ...ids, status: "pending" as const, summary: "" };
    });
    const contentJson = JSON.stringify(result.content);
    const done = await ctx.runMutation(internal.assistant.store.completeStep, {
      turnId, gen, messageId, text, ...(contentJson.length <= LIMITS.contentChars ? { contentJson } : {}), inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens, cacheWriteTokens: result.cacheWriteTokens, billedTokens: cost.tokens, stop: result.stopReason, calls,
    });
    if (done.cancelled) return void await finish("cancelled");
    if (!calls.length) return void await finish("done");

    // 3. Run this step's calls now; the next model step is a fresh action.
    const fresh = await loadContext(ctx, turnId, gen);
    if ("stop" in fresh) { if (fresh.stop === "stale" && fresh.status === "cancelling") await finish("cancelled"); return; }
    const resolved = await resolveCalls(ctx, turnId, gen, fresh, who);
    if (resolved === "cancelled") return void await finish("cancelled");
    if (resolved === "paused") return;
    await ctx.runMutation(internal.assistant.store.next, { turnId, gen });
  },
});
