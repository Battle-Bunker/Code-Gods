/**
 * The settings manifest for pickers (a query the app subscribes to; docs/convex-read-architecture.md R6): object types
 * with their playable instantiations and the priors (stored by manifest/node.ts, which computes them from the code and
 * the calibration files), plus what a query reads itself: the pre-authored dropdown options, languages, the agent
 * sandboxes' state as stored (live: a boot that finishes updates every open page), available runtimes and AI funding
 * status. null until the first refresh stored it (a deploy's, or manifest.node.warm's, which the app calls once per
 * session). Reading it never warms a sandbox: that is manifest.node.warm.
 */
import { v } from "convex/values";
import { DEFAULT_SETTINGS, LANGUAGES, LANGUAGE_SPECS, SETTINGS_OPTIONS } from "@workspace/game-core";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { AI_MODEL_CATALOG, ASSISTANT_BUDGET_MAX, DEFAULT_AGENT_MODEL, mockEnabled, providerConfigured } from "./lib/aiModels";
import { MIN_TICK_MS, TICK_SECONDS } from "./lib/world";
import { sandboxViews } from "./runtime/readiness";

const NAME = "settings";
const row = (ctx: QueryCtx) => ctx.db.query("manifests").withIndex("by_name", q => q.eq("name", NAME)).unique();

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const stored = await row(ctx);
    if (!stored) return null;
    const { objectTypes, priors } = JSON.parse(stored.body) as { objectTypes: unknown[]; priors: string[] };
    const sandboxes = await sandboxViews(ctx, LANGUAGES);   // bounded: one row per language
    return {
      protocolVersion: 1, playerProtocol: PLAYER_PROTOCOL, minimumPlayers: 3, maximumPlayers: 8, defaults: DEFAULT_SETTINGS,
      runtimes: sandboxes.filter(s => s.state !== "failed").map(s => s.language),
      sandboxes: sandboxes.map(({ language, state, reason }) => ({ language, state, ...(reason ? { reason } : {}) })),
      languages: LANGUAGES.map(id => ({ id, ...LANGUAGE_SPECS[id] })), options: SETTINGS_OPTIONS, objectTypes, priors,
      aiFunding: {
        provider: "anthropic", model: DEFAULT_AGENT_MODEL, billing: "direct", mock: mockEnabled(),
        configured: mockEnabled() || providerConfigured("anthropic") || providerConfigured("openai"), live: true,
        models: AI_MODEL_CATALOG.map(m => ({ ...m, configured: mockEnabled() || providerConfigured(m.provider) })),
        /** The largest assistant allowance (tokens per human per game) an owner may approve. */
        assistantBudgetMax: ASSISTANT_BUDGET_MAX,
      },
      engine: { tickSeconds: TICK_SECONDS, minTickMs: MIN_TICK_MS },
    };
  },
});

/** The stored body (tests). */
export const stored = internalQuery({ args: {}, handler: async ctx => (await row(ctx))?.body ?? null });

/** Store the computed part (manifest/node.ts); no write when it is unchanged, so subscribers re-run only on a change. */
export const store = internalMutation({
  args: { body: v.string() },
  handler: async (ctx, { body }): Promise<boolean> => {
    const old = await row(ctx);
    if (old?.body === body) return false;
    if (old) await ctx.db.patch(old._id, { body, updatedAt: Date.now() });
    else await ctx.db.insert("manifests", { name: NAME, body, updatedAt: Date.now() });
    return true;
  },
});
