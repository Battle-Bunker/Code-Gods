"use node";
import { bindRuntime } from "./engine/runtime";
/**
 * The ONE command entry point: a protocol v3 envelope (lib/player-client envelopeSchema), so the default
 * client, a modded player app and the room assistant submit exactly the same thing and get the same
 * receipt. Validate and summon examine the agent here first (the sandbox, a few hundred runs), then commit
 * through game/commands.ts:apply, which re-checks energy, the agent cap and the phase and stores the receipt.
 */
import { v } from "convex/values";
import { envelopeSchema, type CommandResult } from "@workspace/player-client";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { AgentFault, examineAgent } from "./engine/pricing";
import { envelopeHash } from "./game/commands";
import { fail, messageOf } from "./lib/errors";

/** Run one envelope as the authenticated caller, or as an AI seat (`asAi`, engine-internal callers only). */
export async function runEnvelope(ctx: ActionCtx, roomId: string, raw: unknown, asAi?: string): Promise<CommandResult> {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) fail("BAD_REQUEST", `Invalid command envelope: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500)}`);
  const envelope = parsed.data;
  const prepared = await ctx.runQuery(internal.game.commands.prepare, { roomId, asAi, envelope });
  if (prepared.prior) {
    if (prepared.prior.hash !== envelopeHash(envelope)) fail("CONFLICT", "Command ID was reused with different content");
    return prepared.prior.result;
  }
  let examined: { gameId: string; source: string; error?: string; result?: Awaited<ReturnType<typeof examineAgent>> } | undefined;
  const command = envelope.command;
  if (prepared.examine && (command.type === "validate" || command.type === "summon")) {
    try {
      const e = await examineAgent(prepared.examine.settings, command.source, prepared.examine.live);
      examined = { gameId: envelope.gameId!, source: command.source, result: e };
    } catch (error) {
      // The agent's own fault (it does not compile) is a final answer; a host failure (capacity, runtime
      // unavailable) is not: nothing is receipted and the identical envelope can be retried.
      if (!(error instanceof AgentFault)) {
        console.error("Agent examination failed (host)", messageOf(error));
        fail("UNAVAILABLE", "The game runtime could not examine this agent right now; retry the same command");
      }
      examined = { gameId: envelope.gameId!, source: command.source, error: messageOf(error).slice(0, 1000) };
    }
  }
  const result = examined?.result && { cost: examined.result.cost, parts: examined.result.parts, decisionBits: examined.result.decisionBits,
    expectedActCost: examined.result.expectedActCost, breakdown: examined.result.breakdown, randomized: examined.result.randomized,
    diagnostics: examined.result.diagnostics };
  return ctx.runMutation(internal.game.commands.apply, {
    roomId: prepared.roomId, asAi, envelope,
    ...(examined ? { examined: { gameId: examined.gameId, source: examined.source, ...(examined.error !== undefined ? { error: examined.error } : {}), ...(result ? { result } : {}) } } : {}),
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
