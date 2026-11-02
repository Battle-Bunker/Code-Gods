"use node";
import { bindRuntime } from "../engine/runtime";
/**
 * One AI seat turn (plan §9): the seat's own observation (the same projection as a human's, isAI = true)
 * → lib/ai-player's AIController (policy, decision schema, validate-before-summon) → the provider →
 * commands through the same envelope path as humans → reschedule (ai/seats.ts:afterTurn).
 *
 * Providers: Anthropic or OpenAI with the deployment's server-side keys (ANTHROPIC_API_KEY,
 * OPENAI_API_KEY), or — only when AI_MOCK=1 — a mock that plays sensibly without any network:
 * it summons one simple valid agent for the room's object type, in the game's default (first allowed) language, and
 * chats once.
 */
import { v } from "convex/values";
import { AIController, AITurnError, createDirectAnthropicProvider, createDirectOpenAIProvider, type AIFailureReason, type ModelProvider } from "@workspace/ai-player";
import type { Language } from "@workspace/game-core";
import type { Observation } from "@workspace/player-client";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { runEnvelope } from "../commands";
import { findModel, mockEnabled } from "../lib/aiModels";
import { messageOf } from "../lib/errors";
import type { Reservation } from "./seats";

/** A simple valid agent for each object type, in each language (a language without one here is never the mock's pick). */
export const SIMPLE_AGENTS: Record<string, Partial<Record<Language, string>>> = {
  Int: { python: "def agent(x):\n    return [add(1)]", typescript: "function agent(x) { return [add(1)]; }",
    haskell: "agent :: Obj -> [Call]\nagent x = [add 1]" },
  string: { python: "def agent(s):\n    return [rotate(1)]", typescript: "function agent(s) { return [rotate(1)]; }",
    haskell: "agent :: Obj -> [Call]\nagent s = [rotate' 1]" },
  Grid: { python: "def agent(grid):\n    return [slide(row(0), 1)]", typescript: "function agent(grid) { return [slide(row(0), 1)]; }",
    haskell: "agent :: Obj -> [Call]\nagent grid = [slide' (row 0) 1 \"both\"]" },
};

/**
 * The test provider: deterministic, offline, cheap. Reports token usage from the request size. A seat whose strategy
 * has a line `mock-reply: <text>` gets exactly that text back (test/game-ai.test.ts scripts a broken reply with it).
 */
export function mockProvider(): ModelProvider {
  return {
    estimateMaxUsd: (input, output) => (input + output) * 1e-8,
    async complete(request) {
      const scripted = /^mock-reply: (.*)$/m.exec(request.system)?.[1];
      if (scripted !== undefined) return { text: scripted, inputTokens: Math.ceil((request.system.length + request.data.length) / 4), outputTokens: Math.ceil(scripted.length / 4) };
      const { observation } = JSON.parse(request.data) as { observation: Observation };
      const actions: unknown[] = [];
      if (!observation.chat.some(m => m.godId === observation.self.godId)) {
        actions.push({ type: "chat", text: `${observation.self.label} here (a mock AI god). I will summon a simple agent.` });
      }
      const sources = SIMPLE_AGENTS[observation.instance?.objectType ?? ""] ?? {};
      const language = observation.languages.find(l => sources[l] !== undefined);
      if (language && observation.seated !== false && observation.agents.length === 0 && (observation.phase === "planning" || observation.phase === "running")) {
        actions.push({ type: "summon", language, source: sources[language] });
      }
      const text = JSON.stringify({ actions });
      return { text, inputTokens: Math.ceil((request.system.length + request.data.length) / 4), outputTokens: Math.ceil(text.length / 4) };
    },
  };
}

/**
 * The seat status after a failed turn: a class every player in the room may see. Never the error message, which can
 * quote the model's reply (the seat's private reasoning) or a provider response.
 */
type SeatFailure = AIFailureReason | "provider_missing" | "model_retired";
export function failureStatus(reason: SeatFailure): string {
  switch (reason) {
    case "budget_exhausted": return "AI budget or rate limit reached";
    case "invalid_reply": return "Turn failed: the model's reply was not a valid move";
    case "incomplete_reply": return "Turn failed: the model's reply was cut off or declined";
    case "provider_error": return "Turn failed: the AI provider call failed";
    case "provider_missing": return "Turn failed: the AI provider is not configured";
    case "model_retired": return "Turn failed: the seat's model is no longer offered";
    default: return "Turn failed: the turn could not be completed";
  }
}

function providerFor(agent: { provider: string; model: string }): ModelProvider {
  if (mockEnabled()) return mockProvider();
  const config = findModel(agent.provider, agent.model);
  if (!config) throw new Error("The seat's model is no longer offered");
  const key = (config.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
  if (!key) throw new Error(`AI players require a server-side ${config.provider} API key`);
  return config.provider === "anthropic"
    ? createDirectAnthropicProvider(key, { ...config, model: config.id })
    : createDirectOpenAIProvider(key, config.id, config);
}

export const run = internalAction({
  args: { gameId: v.id("games"), godId: v.string(), chain: v.number() },
  handler: async (ctx, { gameId, godId, chain }): Promise<unknown> => {
    await bindRuntime(ctx);
    const context = await ctx.runQuery(internal.ai.seats.turnContext, { gameId, godId, chain });
    if ("stop" in context) return { stopped: context.stop };
    if ("waitUntil" in context) {
      await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ok: true, status: context.status ?? "Waiting", waitUntil: context.waitUntil });
      return { waited: true };
    }
    const { roomId, agent } = context;
    let status = "Thinking";
    let ok = true;
    let failure: SeatFailure | undefined;
    try {
      let provider: ModelProvider;
      try { provider = providerFor(agent); } catch (error) { failure = mockEnabled() || findModel(agent.provider, agent.model) ? "provider_missing" : "model_retired"; throw error; }
      const controller = new AIController({
        roomId, godId, provider, customPrompt: agent.prompt,
        budget: {
          reserve: async (tokens, usd) => {
            const reservation: Reservation = await ctx.runMutation(internal.ai.seats.reserve, { roomId, gameId, tokens, usd });
            if (!reservation.ok) throw new Error(reservation.message);
            return { reservedTokens: reservation.reservedTokens, reservedUsd: reservation.reservedUsd, settle: async (_actual: number, usage: { inputTokens: number; outputTokens: number }) => {
              await ctx.runMutation(internal.ai.seats.settle, { roomId, gameId, reservedTokens: tokens, ...usage });
            } };
          },
        },
        transport: {
          observe: async () => {
            const observation = await ctx.runQuery(internal.game.queries.observationAs, { roomId, godId, at: Date.now() });
            if (!observation) throw new Error("AI seat left the room");
            return observation;
          },
          send: envelope => runEnvelope(ctx, roomId, envelope, godId),
        },
        onEvent: event => {
          if (event.type === "status") status = event.status === "acting" ? "Acting" : event.status === "thinking" ? "Thinking" : status;
          if (event.type === "failure") failure = event.code;
          if (event.type === "command") status = `Sent a command (${event.accepted ? "accepted" : "rejected"})`;
        },
      });
      await controller.step();
      status = status === "Thinking" || status === "Acting" ? "Waiting" : status;
    } catch (error) {
      ok = false;
      const reason = failure ?? (error instanceof AITurnError ? error.reason : "turn_failed");
      const cause = error instanceof Error && error.cause !== undefined ? ` (cause: ${messageOf(error.cause)})` : "";
      console.warn(`AI turn failed for ${godId} [${reason}]: ${messageOf(error)}${cause}`);
      status = failureStatus(reason);
    }
    await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ok, status });
    return { ok, status };
  },
});
