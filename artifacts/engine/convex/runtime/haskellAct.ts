"use node";
/**
 * Haskell acts, in an action of their own: a Haskell execution pool does not fit beside the Python and TypeScript pools
 * in one 512 MiB Node action (runtime/node.ts closeIdleExcept). The actions that run a Haskell agent (the tick, the
 * summon examination, the readiness probe) send its acts here in batches (engine/runtime.ts act), where they run on
 * this instance's Haskell pool against the stored programs (runtime/haskellCompile.ts).
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActResult } from "@workspace/game-runtime";
import { actSettings, haskellProgram } from "../engine/runtime";
import { bindHaskell, runtimeFor } from "./node";
import { HASKELL_ACT_BATCH } from "../lib/haskellPrograms";

export type ActReply = ({ ok: true } & ActResult) | { ok: false; code: string; message: string };

export const acts = internalAction({
  args: { settings: v.any(), requests: v.array(v.object({ source: v.string(), input: v.union(v.string(), v.number()), seed: v.string() })) },
  handler: async (ctx, { settings, requests }): Promise<{ replies: ActReply[]; rssMiB: number }> => {
    if (requests.length > HASKELL_ACT_BATCH) throw new Error(`At most ${HASKELL_ACT_BATCH} acts per call`);
    await bindHaskell(ctx);
    const room = actSettings(settings, "haskell");
    // One after another: the pool has one worker, and a queued act's wait is bounded (startupMs + deadlineMs), so a
    // batch of slow agents must not expire the acts behind them.
    const replies: ActReply[] = [];
    for (const { source, input, seed } of requests) {
      try {
        const { js } = await haskellProgram(ctx, source, settings);
        replies.push({ ok: true, ...await runtimeFor("haskell").actCompiled(source, js, input, room, seed) });
      } catch (error) {
        replies.push({ ok: false, code: String((error as { code?: unknown }).code ?? "UNAVAILABLE"), message: String((error as Error)?.message ?? error) });
      }
    }
    return { replies, rssMiB: Math.round(process.memoryUsage().rss / 1048576) };
  },
});
