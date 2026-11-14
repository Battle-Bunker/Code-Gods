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
import { PlayerClient, type Observation } from "@workspace/player-client";
import { builtinCommand } from "../lib/builtinPlayer";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { runEnvelope } from "../commands";
import { findModel, mockEnabled } from "../lib/aiModels";
import { messageOf } from "../lib/errors";
import type { Reservation } from "./seats";

/** A simple valid agent for each object type, in each language (a language without one here is never the mock's pick). */
export const SIMPLE_AGENTS: Record<string, Partial<Record<Language, string>>> = {
  Int: { python: "def agent(x):\n    return [add(1)]", typescript: "function agent(x) { return [add(1)]; }" },
  string: { python: "def agent(s):\n    return [rotate(1)]", typescript: "function agent(s) { return [rotate(1)]; }" },
  Grid: { python: "def agent(grid):\n    return [slide(row(0), 1)]", typescript: "function agent(grid) { return [slide(row(0), 1)]; }" },
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
        actions.push({ type: "summon", language, source: sources[language], name: "Mock agent", description: "A simple agent from the mock AI." });
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
    case "budget_exhausted": return "AI quota or spending limit reached";
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
  args: { gameId: v.id("games"), godId: v.string(), chain: v.number(), slot: v.optional(v.id("workSlots")) },
  handler: async (ctx, { gameId, godId, chain, slot }): Promise<unknown> => {
    await bindRuntime(ctx);
    // Whatever ends this run before the turn plays gives a slot it was handed back (to the next waiting turn).
    const giveBack = async () => { if (slot) await ctx.runMutation(internal.engine.background.release, { slot }).catch(() => { /* it expires */ }); };
    let context;
    try {
      context = await ctx.runQuery(internal.ai.seats.turnContext, { gameId, godId, chain });
    } catch (error) {
      // A failed read must not end the seat's chain silently: it backs off and retries like any failed turn.
      console.warn(`AI turn context failed for ${godId}: ${messageOf(error)}`);
      await giveBack();
      await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ok: false, status: failureStatus("turn_failed") });
      return { ok: false };
    }
    if ("stop" in context) { await giveBack(); return { stopped: context.stop }; }
    if ("waitUntil" in context) {
      await giveBack();
      await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ok: true, status: context.status ?? "Waiting", waitUntil: context.waitUntil });
      return { waited: true };
    }
    const { roomId, agent } = context;
    // A turn is background work, capped deployment-wide (lib/background.ts): past the cap it is queued and runs when a
    // turn in flight ends (engine/background.ts takeTurn), so many seats' turns never keep the games' ticks waiting for
    // the scheduler. `slot`: this run is that queued turn, already holding its slot.
    let held: Id<"workSlots"> | null;
    try { held = slot ?? await ctx.runMutation(internal.engine.background.takeTurn, { turn: { gameId, godId, chain } }); }
    catch (error) {
      // Many seats asking at once can exhaust the mutation's retries: not the seat's failure. It asks again shortly.
      console.warn(`AI turn slot not taken for ${godId}: ${messageOf(error)}`);
      await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ok: true, status: "Waiting for its turn", waitUntil: Date.now() + 3000 + Math.floor(Math.random() * 3000) });
      return { waited: true };
    }
    if (!held) {
      await ctx.runMutation(internal.ai.seats.queued, { gameId, godId, chain });
      return { queued: true };
    }
    let outcome: { ok: boolean; status: string; waitUntil?: number };
    try {
      await ctx.runMutation(internal.ai.seats.queued, { gameId, godId, chain, playing: true });
      outcome = await playTurn(ctx, { gameId, godId, roomId, agent });
    }
    finally { await ctx.runMutation(internal.engine.background.release, { slot: held }).catch(() => { /* it expires */ }); }
    await ctx.runMutation(internal.ai.seats.afterTurn, { gameId, godId, chain, ...outcome });
    return outcome;
  },
});

/**
 * A built-in player's turn (lib/builtinPlayer.ts): no model, no budget. It observes as any seat does and sends at most
 * one command through the same envelope path as humans.
 */
/** How long a built-in seat whose agent is summoned waits before looking again (it has nothing more to do). */
const BUILTIN_IDLE_MS = 60_000;
async function builtinTurn(ctx: ActionCtx, { roomId, godId, model }: { roomId: TurnContext["roomId"]; godId: string; model: string }): Promise<{ ok: boolean; status: string; waitUntil?: number }> {
  try {
    const transport = {
      observe: async () => {
        const observation = await ctx.runQuery(internal.game.queries.observationAs, { roomId, godId, at: Date.now() });
        if (!observation) throw new Error("AI seat left the room");
        return observation;
      },
      send: (envelope: Parameters<typeof runEnvelope>[2]) => runEnvelope(ctx, roomId, envelope, godId),
    };
    const observation = await transport.observe() as Observation;
    const command = builtinCommand(model, observation);
    if (!command) return observation.agents.length ? { ok: true, status: "Watching its agent", waitUntil: Date.now() + BUILTIN_IDLE_MS } : { ok: true, status: "Waiting" };
    const client = new PlayerClient(transport as ConstructorParameters<typeof PlayerClient>[0]);
    const receipt = await client.execute(client.prepare(command, observation));
    // A refused summon is a failed turn: the seat backs off (seats.ts), and stops after MAX_FAILURES.
    return receipt.accepted ? { ok: true, status: "Summoned the example agent" } : { ok: false, status: failureStatus("turn_failed") };
  } catch (error) {
    console.warn(`Built-in AI turn failed for ${godId}: ${messageOf(error)}`);
    return { ok: false, status: failureStatus("turn_failed") };
  }
}

type TurnContext = Extract<FunctionReturnType<typeof internal.ai.seats.turnContext>, { roomId: unknown }>;
/** One turn of the seat: the provider call and the commands it sends. Never throws: a failure is its status. */
async function playTurn(ctx: ActionCtx, { gameId, godId, roomId, agent }: { gameId: Id<"games">; godId: string; roomId: TurnContext["roomId"]; agent: TurnContext["agent"] }): Promise<{ ok: boolean; status: string; waitUntil?: number }> {
    if (agent.provider === "builtin") return builtinTurn(ctx, { roomId, godId, model: agent.model });
    let status = "Thinking";
    let ok = true;
    let failure: SeatFailure | undefined;
    // A refused reservation's own sentence (which quota, ceiling or rule), shown as the seat's status.
    let refusal: string | undefined;
    try {
      let provider: ModelProvider;
      try { provider = providerFor(agent); } catch (error) { failure = mockEnabled() || findModel(agent.provider, agent.model) ? "provider_missing" : "model_retired"; throw error; }
      const controller = new AIController({
        roomId, godId, provider, customPrompt: agent.prompt,
        budget: {
          reserve: async (tokens, usd) => {
            const reservation: Reservation = await ctx.runMutation(internal.ai.seats.reserve, { roomId, gameId, tokens, usd });
            if (!reservation.ok) { refusal = reservation.message; throw new Error(reservation.message); }
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
      status = reason === "budget_exhausted" && refusal ? refusal.replace(/\.$/, "") : failureStatus(reason);
    }
    return { ok, status };
}
