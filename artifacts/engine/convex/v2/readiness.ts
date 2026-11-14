/**
 * Sandbox readiness (v1's rule, restored; archive/engine-v1 runtime/readiness.ts and the product memory: "Players never
 * wait for agent sandboxes to boot: launches are async, and whatever needs a warm sandbox says 'not ready yet'").
 *
 * One `v2RuntimeReadiness` row per language and runtime version: "warming" while the scheduled `v2/runtime:warm` boots
 * it, "ready" once a boot succeeded, "failed" with the reason. A game's start begins warming every language that is not
 * ready; `agent.check` answers "not ready yet" instead of waiting; the tick skips the agents of languages not ready; and
 * planning holds past its deadline until every language is ready, so world time starts for everyone at once.
 * Pure reads and writes here (any runtime); the boot itself is runtime.ts (Node).
 */
import { makeFunctionReference } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type RuntimeLanguage = "typescript" | "python";
export const LANGUAGES: readonly RuntimeLanguage[] = ["typescript", "python"];
/**
 * The runtime each language runs, as its readiness is keyed: the pinned CPython bundle (lib/v2-sandbox
 * PYTHON_BUNDLE_SHA256; a unit test keeps them equal) and the QuickJS package. A new runtime warms afresh.
 */
export const RUNTIME_VERSION: Record<RuntimeLanguage, string> = {
  python: "cpython:5aacc3bef36d8c7039ef3a1cd04eb0c4948d73efaf67e3e3e492d647a4421cfa",
  typescript: "quickjs-emscripten:0.31.0",
};
/** A warm-up that has said nothing for this long is started again. */
const WARMING_STALE_MS = 120_000;
const WARM = makeFunctionReference<"action", { language: RuntimeLanguage; version: string }>("v2/runtime:warm");

export type Readiness = { state: "warming" | "ready" | "failed"; reason?: string };

export async function readinessOf(ctx: QueryCtx, language: RuntimeLanguage): Promise<Readiness | null> {
  const row = await ctx.db.query("v2RuntimeReadiness").withIndex("by_language_version", q => q.eq("language", language).eq("version", RUNTIME_VERSION[language])).unique();
  return row ? { state: row.state, ...(row.reason ? { reason: row.reason } : {}) } : null;
}
export async function isReady(ctx: QueryCtx, language: RuntimeLanguage) {
  return (await readinessOf(ctx, language))?.state === "ready";
}
export async function allReady(ctx: QueryCtx) {
  for (const l of LANGUAGES) if (!await isReady(ctx, l)) return false;
  return true;
}

/** Starts warming every language that is not ready (and not already warming), never waiting for it. */
export async function ensureWarm(ctx: MutationCtx) {
  const now = Date.now();
  for (const language of LANGUAGES) {
    const version = RUNTIME_VERSION[language];
    const row = await ctx.db.query("v2RuntimeReadiness").withIndex("by_language_version", q => q.eq("language", language).eq("version", version)).unique();
    if (row?.state === "ready" || (row?.state === "warming" && now - row.at < WARMING_STALE_MS)) continue;
    if (row) await ctx.db.patch(row._id, { state: "warming", reason: undefined, at: now });
    else await ctx.db.insert("v2RuntimeReadiness", { language, version, state: "warming", at: now });
    await ctx.scheduler.runAfter(0, WARM, { language, version });
  }
}

/** The warm-up's outcome (runtime.ts warm). */
export async function settleReadiness(ctx: MutationCtx, language: RuntimeLanguage, version: string, ok: boolean, reason?: string) {
  const row = await ctx.db.query("v2RuntimeReadiness").withIndex("by_language_version", q => q.eq("language", language).eq("version", version)).unique();
  const next = { state: ok ? "ready" as const : "failed" as const, reason: ok ? undefined : reason?.slice(0, 500), at: Date.now() };
  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("v2RuntimeReadiness", { language, version, ...next });
}

/** "The Python runtime is still starting": what a read or check that needs a sandbox answers instead of waiting. */
export const notReadyText = (language: RuntimeLanguage, r: Readiness | null) =>
  r?.state === "failed" ? `The ${language === "python" ? "Python" : "TypeScript"} runtime failed to start: ${r.reason ?? "unknown"}.`
    : `The ${language === "python" ? "Python" : "TypeScript"} runtime is still starting; try again in a few seconds.`;
