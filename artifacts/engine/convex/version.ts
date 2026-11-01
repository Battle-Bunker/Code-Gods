/**
 * The deployed versions every client watches, so a running page learns of a deploy and updates itself
 * (lib/player-client/src/update.ts; docs/engine-api.md "Deployed versions").
 *
 *   engine     the engine UI's static build (served at /)        recorded by scripts/deploy-static.mjs after its upload
 *   player     the player client's static build (at /client/)    likewise
 *   functions  the engine's functions                            recorded by the deploy workflow after `convex deploy`
 *
 * A build id is the one the build wrote into its index.html (`<meta name="code-gods-build">`). Each deploy adds a row;
 * the same build again adds none, a rollback to an earlier build does (so the newer one reads as outdated). The last
 * HISTORY rows per site are kept: a page whose build is among them but not the latest is outdated; one whose build is
 * not among them (a dev server, or a build uploaded a moment before it is recorded) is left alone.
 */
import { v } from "convex/values";
import { internalMutation, query, type QueryCtx } from "./_generated/server";

export const SITES = ["engine", "player", "functions"] as const;
const siteV = v.union(v.literal("engine"), v.literal("player"), v.literal("functions"));
const HISTORY = 20;

async function history(ctx: QueryCtx, site: (typeof SITES)[number]) {
  return ctx.db.query("siteBuilds").withIndex("by_site", q => q.eq("site", site)).order("desc").take(HISTORY + 1);
}

/** Per site: the live build, when it was recorded and the recent builds newest first (the live one included); null before any. */
export const current = query({
  args: {},
  handler: async ctx => {
    const out: Record<string, { build: string; deployedAt: number; recent: string[] } | null> = {};
    for (const site of SITES) {
      const rows = (await history(ctx, site)).slice(0, HISTORY);
      out[site] = rows.length ? { build: rows[0].build, deployedAt: rows[0].deployedAt, recent: rows.map(r => r.build) } : null;
    }
    return out as Record<(typeof SITES)[number], { build: string; deployedAt: number; recent: string[] } | null>;
  },
});

/** A deploy finished: `build` is live on `site`. Idempotent for the live build. */
export const record = internalMutation({
  args: { site: siteV, build: v.string() },
  handler: async (ctx, { site, build }) => {
    if (!/^[\w.:-]{1,80}$/.test(build)) throw new Error("A build id is 1 to 80 letters, digits, '.', ':', '_' or '-'");
    const rows = await history(ctx, site);
    if (rows[0]?.build === build) return { recorded: false };
    await ctx.db.insert("siteBuilds", { site, build, deployedAt: Date.now() });
    for (const old of rows.slice(HISTORY - 1)) await ctx.db.delete(old._id);
    return { recorded: true };
  },
});
