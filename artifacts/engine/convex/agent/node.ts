"use node";
/**
 * Node halves of the agent registry: background summon/validate commands (they examine the agent in the
 * sandbox and must finish even when the tool call stops waiting) and evaluate_value (the trusted utility
 * evaluator and calibration tables live behind "use node").
 */
import { ConvexError, v } from "convex/values";
import { instantiationOf, type GameSettings, type ObjectValue } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { runEnvelope } from "../commands";
import { tablesFor } from "../engine/calibration";
import { score } from "../engine/node";
import { bindRuntime } from "../engine/runtime";
import { fail, messageOf } from "../lib/errors";
import { principalV } from "../lib/rooms";
import type { myUtilityFor } from "../player";

/** One scheduled summon/validate as the principal; a run that ends without a receipt records its error on the job. */
export const runCommand = internalAction({
  args: { principal: principalV, roomId: v.string(), subject: v.string(), envelope: v.any() },
  handler: async (ctx, { principal, roomId, subject, envelope }): Promise<void> => {
    const job = { roomId, subject, commandId: String(envelope?.commandId ?? "") };
    try {
      await bindRuntime(ctx);
      await runEnvelope(ctx, roomId, envelope, undefined, principal);
      await ctx.runMutation(internal.agent.store.finishJob, job);
    } catch (error) {
      const data = error instanceof ConvexError ? error.data as { code?: string } : undefined;
      await ctx.runMutation(internal.agent.store.finishJob, { ...job, error: { code: String(data?.code ?? "UNAVAILABLE"), message: messageOf(error).slice(0, 1000) } });
    }
  },
});

type Evaluation = {
  gameId: string; value: number | string; ordinal: unknown; rewardBits: number; netBits: number; penalty?: { ordinal: unknown; bits: number };
};
/** The caller's OWN utility on one wire value of the current game (never another god's). */
export const evaluate = internalAction({
  args: { principal: principalV, roomId: v.string(), value: v.union(v.number(), v.string()) },
  handler: async (ctx, { principal, roomId, value }): Promise<Evaluation> => {
    const mine: Awaited<ReturnType<typeof myUtilityFor>> = await ctx.runQuery(internal.player.myUtilityAs, { principal, roomId });
    if (!mine) return fail("CONFLICT", "You are not seated in a current game");
    let tables;
    try { tables = await tablesFor(ctx, instantiationOf(mine.settings as GameSettings)); } catch (error) {
      return fail("UNAVAILABLE", `The calibration tables could not be loaded: ${messageOf(error).slice(0, 300)}`);
    }
    let s;
    try {
      s = score(tables, mine.settings as GameSettings, mine.utility as UtilityDescriptor, value as ObjectValue);
    } catch (error) {
      return fail("BAD_REQUEST", `Not a value of this game's object type: ${messageOf(error).slice(0, 300)}`);
    }
    return {
      gameId: mine.gameId, value, ordinal: s.ordinal, rewardBits: s.rewardBits, netBits: s.netBits,
      ...(s.penaltyBits !== undefined ? { penalty: { ordinal: s.penaltyOrdinal, bits: s.penaltyBits } } : {}),
    };
  },
});
