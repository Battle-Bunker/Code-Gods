/**
 * The deployed versions every client watches, so a running page learns of a deploy and updates itself
 * (lib/player-client/src/update.ts; docs/engine-api.md "Deployed versions").
 *
 *   engine     the engine UI's static build (served at /)        recorded by scripts/deploy-static.mjs after its upload
 *   player     the player client's static build (at /client/)    likewise
 *   functions  the engine's functions                            recorded by the deploy workflow after `convex deploy`
 *
 * A static build's id is the one deploy-static stamped into its index.html (`<meta name="code-gods-build">`). Each
 * deploy adds a row; the same build again adds none, a rollback to an earlier build does (so the newer one reads as
 * outdated). A page asks with its own build: `known` says whether that build was ever deployed here. A known build
 * that is not the latest is outdated; an unknown one (a dev server, a build uploaded a moment before it is recorded,
 * or another deployment's) is left alone.
 */
import { v } from "convex/values";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { versionSiteV } from "./schema";

const SITES = ["engine", "player", "functions"] as const;
type Site = (typeof SITES)[number];
/** Rows kept per site (a page open across more deploys than this stops updating itself). */
const HISTORY = 1000;
const BUILD_ID = /^[\w.:-]{1,80}$/;

const latest = (ctx: QueryCtx, site: Site) => ctx.db.query("siteBuilds").withIndex("by_site", q => q.eq("site", site)).order("desc").first();

/** Per site the live build and when it was recorded (null before any); with `own`, whether that build was ever deployed. */
export const current = query({
  args: { own: v.optional(v.object({ site: versionSiteV, build: v.string() })) },
  handler: async (ctx, { own }) => {
    const out = {} as Record<Site, { build: string; deployedAt: number } | null>;
    for (const site of SITES) {
      const row = await latest(ctx, site);
      out[site] = row ? { build: row.build, deployedAt: row.deployedAt } : null;
    }
    if (!own) return out;
    const known = BUILD_ID.test(own.build)
      && (await ctx.db.query("siteBuilds").withIndex("by_site_build", q => q.eq("site", own.site).eq("build", own.build)).first()) !== null;
    return { ...out, known };
  },
});

/** A deploy finished: `build` is live on `site`. Idempotent for the live build. */
export const record = internalMutation({
  args: { site: versionSiteV, build: v.string() },
  handler: async (ctx, { site, build }) => {
    if (!BUILD_ID.test(build)) throw new Error("A build id is 1 to 80 letters, digits, '.', ':', '_' or '-'");
    if ((await latest(ctx, site))?.build === build) return { recorded: false };
    await ctx.db.insert("siteBuilds", { site, build, deployedAt: Date.now() });
    const old = await ctx.db.query("siteBuilds").withIndex("by_site", q => q.eq("site", site)).order("desc").take(HISTORY + 10);
    for (const row of old.slice(HISTORY)) await ctx.db.delete(row._id);
    return { recorded: true };
  },
});
