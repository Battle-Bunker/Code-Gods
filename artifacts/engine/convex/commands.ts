"use node";
import { bindRuntime, sandboxGate } from "./engine/runtime";
/**
 * The ONE command entry point: a protocol v3 envelope (lib/player-client envelopeSchema), so the default
 * client, a modded player app and the room assistant submit exactly the same thing and get the same
 * receipt. Validate and summon examine the agent here first (the sandbox, a few hundred runs), then commit
 * through game/commands.ts:apply, which re-checks energy, the agent cap and the phase and stores the receipt.
 */
import { ConvexError, v } from "convex/values";
import type { Language } from "@workspace/game-core";
import { EXAMINATION_DEADLINE_MS, envelopeSchema, examinesProgram, type CommandResult } from "@workspace/player-client";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { AgentFault, examinationKey, examineAgent, type StoredExamination } from "./engine/pricing";
import { withBackgroundSlot } from "./engine/background";
import { EXAMINATION_WAIT_MS } from "./lib/background";
import { envelopeHash } from "./game/commands";
import { DeadlineExceeded, examinationBusyMessage, within } from "./lib/deadline";
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
  let examined: { gameId: string; source: string; language: Language; error?: string; twins?: number; result?: Awaited<ReturnType<typeof examineAgent>> } | undefined;
  const command = envelope.command;
  if (prepared.examine && examinesProgram(command)) {
    // A cold sandbox is never waited for: the caller is told it is warming (nothing examined, claimed or receipted).
    const notReady = await sandboxGate(ctx, command.language);
    if (notReady) {
      const { message, ...rest } = notReady;
      return { commandId: envelope.commandId, accepted: false, message, notReady: rest };
    }
    // The abuse cap, before the expensive part (throws RATE_LIMITED; nothing is receipted).
    await ctx.runMutation(internal.game.commands.claimExamination, { roomId: prepared.roomId, godId: prepared.godId });
    try {
      // Examinations are background work, capped deployment-wide (engine/background.ts) so every game's tick keeps
      // its capacity: past the cap this one waits a few seconds for a slot, then answers "busy" (retryable).
      // A person (the forge, the assistant's validate_agent, an agent tool) is waiting: under a congested sandbox queue
      // the examination is given up at its deadline and the caller told so. An AI seat's turn has its own bounds.
      const examine = prepared.examine, asked = Date.now();
      // The program's remembered runs (lib/examinationCache.ts). When they answer the whole examination (a summon
      // after its validate, an example another player already examined on the same objects), nothing runs in the
      // sandbox and no slot is needed: the answer is immediate however busy the deployment is.
      const stored = await ctx.runQuery(internal.engine.examinationCache.get, { key: examinationKey(examine.settings, command.language, command.source) }) as StoredExamination;
      const who = asAi ? { lane: "background" as const, stored } : { lane: "human" as const, deadline: asked + EXAMINATION_DEADLINE_MS, stored };
      const remembered = !stored ? undefined
        : await examineAgent(ctx, examine.settings, command.language, command.source, examine.live, { ...who, cacheOnly: true }).catch(() => undefined);
      const examineNow = () => examineAgent(ctx, examine.settings, command.language, command.source, examine.live, who);
      // An AI seat's turn already holds its own slot (ai/turn.ts): its examinations run under that one.
      const ran = remembered ? { busy: false as const, value: remembered }
        : asAi ? { busy: false as const, value: await examineNow() }
        // The wait for a slot counts towards the deadline: the caller's own (the app's) starts when it asked.
        : await withBackgroundSlot(ctx, "examination", EXAMINATION_WAIT_MS, () => within(examineNow(), EXAMINATION_DEADLINE_MS - (Date.now() - asked)));
      if (ran.busy) fail("UNAVAILABLE", "The agent sandbox is busy with other players' agents: nothing was validated, summoned, replaced or paid. Send the same command again in a few seconds.");
      const e = ran.value;
      examined = { gameId: envelope.gameId!, source: command.source, language: command.language, twins: prepared.examine.twins, result: e };
    } catch (error) {
      if (error instanceof ConvexError) throw error;   // the "busy" answer above
      // Not finished in time: nothing is receipted (the commit below is never reached), so the identical envelope can
      // be sent again. The sandbox drops the abandoned examination's remaining runs at the same deadline.
      if (error instanceof DeadlineExceeded) {
        console.error(`Agent examination given up after ${error.ms} ms (sandbox busy)`);
        fail("UNAVAILABLE", examinationBusyMessage(command.type, error.ms));
      }
      // The agent's own fault (it does not compile) is a final answer; a host failure (capacity, runtime
      // unavailable) is not: nothing is receipted and the identical envelope can be retried.
      if (!(error instanceof AgentFault)) {
        console.error("Agent examination failed (host)", messageOf(error));
        fail("UNAVAILABLE", "The game runtime could not examine this agent right now; retry the same command");
      }
      examined = { gameId: envelope.gameId!, source: command.source, language: command.language, error: messageOf(error).slice(0, 1000) };
    }
  }
  const result = examined?.result && { cost: examined.result.cost, parts: examined.result.parts,
    expectedActCost: examined.result.expectedActCost, breakdown: examined.result.breakdown, randomized: examined.result.randomized,
    changeRate: examined.result.changeRate, invalidRate: examined.result.invalidRate, skipRate: examined.result.skipRate,
    futility: examined.result.futility, warnings: examined.result.warnings,
    ...(examined.result.firstError ? { firstError: examined.result.firstError } : {}),
    diagnostics: examined.result.diagnostics };
  return ctx.runMutation(internal.game.commands.apply, {
    roomId: prepared.roomId, asAi, principal, envelope,
    ...(examined ? { examined: { gameId: examined.gameId, source: examined.source, language: examined.language, ...(examined.error !== undefined ? { error: examined.error } : {}), ...(result ? { result } : {}),
      ...(examined.twins ? { twins: examined.twins } : {}) } } : {}),
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
