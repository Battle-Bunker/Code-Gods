"use node";
/**
 * One scheduled warm-up (runtime/readiness.ts ensure): boot a language's sandbox on this Node instance (load the
 * Python bundle, start workers, run the empty agent) and record the outcome. Nobody waits on it; the instance it ran
 * on stays warm for the actions that follow.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { bindRuntime, probeLanguage } from "../engine/runtime";
import { languageV } from "../lib/language";
import { messageOf } from "../lib/errors";
import { runtimeVersion } from "./node";

export const run = internalAction({
  args: { language: languageV, token: v.number() },
  handler: async (ctx, { language, token }): Promise<{ ok: boolean; bootMs: number }> => {
    const started = performance.now();
    let reason: string | undefined;
    try {
      await bindRuntime(ctx);
      const probe = await probeLanguage(language);
      if (!probe.ok) reason = probe.reason;
    } catch (error) { reason = messageOf(error); }
    const bootMs = Math.round(performance.now() - started);
    await ctx.runMutation(internal.runtime.readiness.settle, { language, token, version: runtimeVersion(language), ok: !reason, ...(reason ? { reason: reason.slice(0, 500) } : {}), bootMs });
    return { ok: !reason, bootMs };
  },
});
