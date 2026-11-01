/**
 * Agent sandbox readiness (rules: lib/sandboxes.ts). `ensure` is the one way a warm-up is scheduled: the start, the
 * settings manifest, validate/summon, run_code and the tick call it (through engine/runtime.ts ensureSandboxes) with
 * the runtime versions their code pins. A call that finds every language ready writes nothing. `settle` records a
 * boot's outcome (runtime/warm.ts).
 */
import { v } from "convex/values";
import type { Language } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { languageV } from "../lib/language";
import { effectiveSandbox, needsWarm, type SandboxView } from "../lib/sandboxes";

export type ReadinessDoc = Doc<"runtimeReadiness">;
export type LanguageSandbox = SandboxView & { language: Language; readyAt?: number };

async function rowOf(ctx: QueryCtx, language: Language): Promise<ReadinessDoc | null> {
  return ctx.db.query("runtimeReadiness").withIndex("by_language", q => q.eq("language", language)).first();
}

/** The stored rows for these languages (null: never warmed), for Node callers that compare versions. */
export async function readinessRows(ctx: QueryCtx, languages: readonly Language[]) {
  return Promise.all(languages.map(async language => ({ language, row: await rowOf(ctx, language) })));
}

/** The rows for these languages (Node callers compare versions: engine/runtime.ts ensureSandboxes's fast path). */
export const rows = internalQuery({
  args: { languages: v.array(languageV) },
  handler: async (ctx, { languages }) => readinessRows(ctx, languages),
});

/** What players see per language (queries cannot know the code's version, so they trust the rows). */
export async function sandboxViews(ctx: QueryCtx, languages: readonly Language[]): Promise<LanguageSandbox[]> {
  return (await readinessRows(ctx, languages)).map(({ language, row }) =>
    ({ language, ...effectiveSandbox(row), ...(row?.state === "ready" && row.readyAt !== undefined ? { readyAt: row.readyAt } : {}) }));
}

const runtimeV = v.object({ language: languageV, version: v.string(), asset: v.optional(v.string()) });

/**
 * Schedule a warm-up for each language that needs one (never warmed, another runtime version, a lost or failed boot
 * past its backoff, or, with `keepWarm`, a ready runtime last booted over KEEP_WARM_MS ago) and return each
 * language's readiness for these versions. A language whose `asset` (its runtime bundle in file storage) is missing
 * or is not the pinned version is reported failed with the reason, and nothing is scheduled: booting cannot help.
 */
export const ensure = internalMutation({
  args: { runtimes: v.array(runtimeV), keepWarm: v.optional(v.boolean()) },
  handler: async (ctx, { runtimes, keepWarm }): Promise<LanguageSandbox[]> => {
    const now = Date.now();
    const out: LanguageSandbox[] = [];
    for (const { language, version, asset } of runtimes) {
      let row = await rowOf(ctx, language);
      if (asset) {
        const stored = await ctx.db.query("runtimeAssets").withIndex("by_name", q => q.eq("name", asset)).unique();
        if (!stored || stored.sha256 !== version) {
          const reason = stored
            ? "the uploaded runtime bundle is not the version this deployment pins (run upload-runtime)"
            : "the runtime bundle is not uploaded to this deployment (run upload-runtime)";
          // Recorded (so every reader sees it), not booted; attempts 0: an upload is noticed within one short backoff.
          const failed = { language, version, state: "failed" as const, reason, attemptAt: now, attempts: 0, readyAt: undefined };
          if (!row) await ctx.db.insert("runtimeReadiness", failed);
          else if (row.state !== "failed" || row.reason !== reason || row.version !== version) await ctx.db.patch(row._id, failed);
          out.push({ language, state: "failed", reason });
          continue;
        }
      }
      if (needsWarm(row, { now, version, keepWarm })) {
        const same = row?.version === version;
        const patch = {
          language, version, attemptAt: now,
          // A refresh of a ready runtime stays ready; anything else is warming until the boot reports.
          state: same && row!.state === "ready" ? "ready" as const : "warming" as const,
          attempts: same ? row!.attempts : 0,
          readyAt: same ? row!.readyAt : undefined, reason: undefined,
        };
        if (row) await ctx.db.patch(row._id, patch);
        else await ctx.db.insert("runtimeReadiness", patch);
        row = { ...(row ?? {} as ReadinessDoc), ...patch };
        await ctx.scheduler.runAfter(0, internal.runtime.warm.run, { language, token: now });
      }
      out.push({ language, ...effectiveSandbox(row, version), ...(row?.state === "ready" && row.readyAt !== undefined ? { readyAt: row.readyAt } : {}) });
    }
    return out;
  },
});

/** A boot's outcome. Ignored unless it answers the latest scheduled boot (`token` = its attemptAt). */
export const settle = internalMutation({
  args: { language: languageV, token: v.number(), version: v.string(), ok: v.boolean(), reason: v.optional(v.string()), bootMs: v.number() },
  handler: async (ctx, { language, token, version, ok, reason, bootMs }) => {
    const row = await rowOf(ctx, language);
    if (!row || row.attemptAt !== token) return { applied: false };
    const now = Date.now();
    if (ok) {
      const readyAt = row.version === version && row.readyAt !== undefined ? row.readyAt : now;
      await ctx.db.patch(row._id, { version, state: "ready", reason: undefined, attempts: 0, readyAt, bootMs });
    } else if (row.state === "ready" && row.version === version) {
      // A keep-warm refresh failed on one instance: this version has booted, so one transient failure does not take the
      // language away from every game. A broken runtime still shows in the act's own host error.
      console.warn(`Agent sandbox ${language} keep-warm boot failed (still ready): ${reason}`);
      await ctx.db.patch(row._id, { bootMs });
    } else {
      console.warn(`Agent sandbox ${language} failed to boot: ${reason}`);
      await ctx.db.patch(row._id, { version, state: "failed", reason: (reason ?? "unknown error").slice(0, 500), attempts: row.attempts + 1, readyAt: undefined, bootMs });
    }
    return { applied: true };
  },
});
