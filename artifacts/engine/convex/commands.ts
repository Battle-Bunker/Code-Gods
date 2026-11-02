"use node";
import { bindRuntime, sandboxGate } from "./engine/runtime";
/**
 * The ONE command entry point: a protocol v3 envelope (lib/player-client envelopeSchema), so the default
 * client, a modded player app and the room assistant submit exactly the same thing and get the same
 * receipt. Validate and summon examine the agent here first (the sandbox, a few hundred runs), then commit
 * through game/commands.ts:apply, which re-checks energy, the agent cap and the phase and stores the receipt.
 */
import { v } from "convex/values";
import type { Language } from "@workspace/game-core";
import { envelopeSchema, type CommandResult } from "@workspace/player-client";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { AgentFault, examineAgent } from "./engine/pricing";
import { envelopeHash } from "./game/commands";
import { fail, messageOf } from "./lib/errors";
import { principalV, type Principal } from "./lib/rooms";

/**
 * Run one envelope as the authenticated caller, as the human behind a principal (agent tools), or as an AI
 * seat (`asAi`, engine-internal callers only).
 */
export async function runEnvelope(ctx: ActionCtx, roomId: string, raw: unknown, asAi?: string, principal?: Principal): Promise<CommandResult> {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) fail("BAD_REQUEST", `Invalid command envelope: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500)}`);
  const envelope = parsed.data;
  const prepared = await ctx.runQuery(internal.game.commands.prepare, { roomId, asAi, principal, envelope });
  if (prepared.prior) {
    if (prepared.prior.hash !== envelopeHash(envelope)) fail("CONFLICT", "Command ID was reused with different content");
    return prepared.prior.result;
  }
  let examined: { gameId: string; source: string; language: Language; error?: string; result?: Awaited<ReturnType<typeof examineAgent>> } | undefined;
  const command = envelope.command;
  if (prepared.examine && (command.type === "validate" || command.type === "summon")) {
    // A cold sandbox is never waited for: the caller is told it is warming (nothing examined, claimed or receipted).
    const notReady = await sandboxGate(ctx, command.language);
    if (notReady) {
      const { message, ...rest } = notReady;
      return { commandId: envelope.commandId, accepted: false, message, notReady: rest };
    }
    // The abuse cap, before the expensive part (throws RATE_LIMITED; nothing is receipted).
    await ctx.runMutation(internal.game.commands.claimExamination, { roomId: prepared.roomId, godId: prepared.godId });
    try {
      const e = await examineAgent(ctx, prepared.examine.settings, command.language, command.source, prepared.examine.live);
      examined = { gameId: envelope.gameId!, source: command.source, language: command.language, result: e };
    } catch (error) {
      // The agent's own fault (it does not compile) is a final answer; a host failure (capacity, runtime
      // unavailable) is not: nothing is receipted and the identical envelope can be retried.
      if (!(error instanceof AgentFault)) {
        console.error("Agent examination failed (host)", messageOf(error));
        fail("UNAVAILABLE", "The game runtime could not examine this agent right now; retry the same command");
      }
      examined = { gameId: envelope.gameId!, source: command.source, language: command.language, error: messageOf(error).slice(0, 1000) };
    }
  }
  const result = examined?.result && { cost: examined.result.cost, parts: examined.result.parts, decisionBits: examined.result.decisionBits,
    expectedActCost: examined.result.expectedActCost, breakdown: examined.result.breakdown, randomized: examined.result.randomized,
    changeRate: examined.result.changeRate, invalidRate: examined.result.invalidRate,
    diagnostics: examined.result.diagnostics };
  return ctx.runMutation(internal.game.commands.apply, {
    roomId: prepared.roomId, asAi, principal, envelope,
    ...(examined ? { examined: { gameId: examined.gameId, source: examined.source, language: examined.language, ...(examined.error !== undefined ? { error: examined.error } : {}), ...(result ? { result } : {}) } } : {}),
  });
}

/**
 * Submit a v3 command envelope {version, commandId (uuid), gameId?, command} for the caller in this room.
 * Returns the CommandResult receipt (accepted or not; validation results for validate). Retrying the
 * identical envelope returns the same receipt; reusing a commandId with different content is an error.
 */
export const submit = action({
  args: { roomId: v.string(), envelope: v.any() },
  handler: async (ctx, { roomId, envelope }): Promise<CommandResult> => { await bindRuntime(ctx); return runEnvelope(ctx, roomId, envelope); },
});

/** Internal twin of `submit` for a principal {credentialId} (the agent registry; scheduled summon/validate). */
export const submitAs = internalAction({
  args: { principal: principalV, roomId: v.string(), envelope: v.any() },
  handler: async (ctx, { principal, roomId, envelope }): Promise<CommandResult> => {
    await bindRuntime(ctx);
    return runEnvelope(ctx, roomId, envelope, undefined, principal);
  },
});
