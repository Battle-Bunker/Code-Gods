"use node";
/**
 * Agent acts (and Python's inspections), in actions of the language's own. A 512 MiB Node action holds one language's
 * warm pool comfortably, not every language's, so the actions that run games (the tick, summon examinations, probes)
 * hold none: engine/runtime.ts sends each language's acts here in batches, one call per language, in parallel. An
 * instance runs one action at a time, and keeps only the pools of the language it last ran (runtime/node.ts
 * closeIdleExcept).
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActResult, Inspection } from "@workspace/game-runtime";
import { actHere, bindRuntime, inspectHere } from "../engine/runtime";
import { ACT_BATCH } from "../lib/programs";
import { languageV } from "../lib/language";
import { memoryOf, rssNow, type Memory } from "./memory";

/** A failed act still carries the bits it read before it stopped (docs/energy-model.md §3.4), when the runtime said. */
export type ActReply = ({ ok: true } & ActResult) | { ok: false; code: string; message: string; readBits?: number };
const failure = (error: unknown) => {
  const readBits = (error as { readBits?: unknown })?.readBits;
  return { ok: false as const, code: String((error as { code?: unknown })?.code ?? "UNAVAILABLE"), message: String((error as Error)?.message ?? error),
    ...(typeof readBits === "number" ? { readBits } : {}) };
};

export const run = internalAction({
  args: {
    language: languageV, settings: v.any(), requests: v.array(v.object({ source: v.string(), input: v.union(v.string(), v.number()), seed: v.string() })),
    /** The lane (engine/runtime.ts ActLane): `background` acts wait for every tick's; past `deadline` an act not yet started fails with CAPACITY. */
    background: v.optional(v.boolean()), deadline: v.optional(v.number()),
  },
  handler: async (ctx, { language, settings, requests, background, deadline }): Promise<{ replies: ActReply[] } & Memory> => {
    const startMiB = rssNow();
    if (requests.length > ACT_BATCH) throw new Error(`At most ${ACT_BATCH} acts per call`);
    if (language === "python") await bindRuntime(ctx);
    // One after another: the pool has one worker, and a queued act's wait is bounded (startupMs + deadlineMs), so a
    // batch of slow agents must not expire the acts behind them.
    const replies: ActReply[] = [];
    const lane = { ...(background ? { background } : {}), ...(deadline !== undefined ? { deadline } : {}) };
    for (const { source, input, seed } of requests) {
      try { replies.push({ ok: true, ...await actHere(ctx, source, language, input, settings, seed, lane) }); }
      catch (error) { replies.push(failure(error)); }
    }
    return { replies, ...memoryOf(startMiB) };
  },
});

export const inspect = internalAction({
  args: { source: v.string(), settings: v.any() },
  handler: async (ctx, { source, settings }): Promise<({ ok: true; inspection: Inspection } | { ok: false; code: string; message: string }) & Memory> => {
    const startMiB = rssNow();
    await bindRuntime(ctx);
    try { return { ok: true, inspection: await inspectHere(source, settings), ...memoryOf(startMiB) }; }
    catch (error) { return { ...failure(error), ...memoryOf(startMiB) }; }
  },
});
