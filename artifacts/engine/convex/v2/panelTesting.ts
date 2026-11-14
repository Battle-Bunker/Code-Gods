/** Test-only fixtures for test/v2-panels.test.ts; refused unless TEST_FIXTURES is set (local deployments). */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { fixturesOn } from "../auth/identity";

const fixtures = () => {
  if (!fixturesOn(process.env)) throw new ConvexError({ code: "FORBIDDEN", message: "v2 fixtures need TEST_FIXTURES=1" });
};

/** `count` minimal panels seeded-0 … for `userId` (bypasses the compiler and the rate limit). */
export const seedPanels = internalMutation({
  args: { userId: v.string(), count: v.number() },
  handler: async (ctx, { userId, count }) => {
    fixtures();
    const author = { kind: "browser" as const, label: "seed" };
    for (let i = 0; i < count; i++) {
      const panelId = await ctx.db.insert("v2Panels", {
        userId, slug: `seeded-${i}`, title: `Seeded ${i}`, placement: "right", size: "md", currentVersion: 1, enabled: true,
        updatedAt: Date.now(), sdk: 2, author, lastForeignVersion: 0,
      });
      await ctx.db.insert("v2PanelVersions", {
        panelId, version: 1, source: "export default null;", compiled: "exports.default = null;", diagnostics: [], compilerVersion: "seed",
        sourceHash: "seed", author, manifest: {}, createdAt: Date.now(), foreign: false,
      });
    }
  },
});

/** Moves a human's recorded save times `ms` into the past (the rate limit's window). */
export const ageSaves = internalMutation({
  args: { userId: v.string(), ms: v.number() },
  handler: async (ctx, { userId, ms }) => {
    fixtures();
    const doc = await ctx.db.query("v2PanelQuotas").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (doc) await ctx.db.patch(doc._id, { saves: doc.saves.map(at => at - ms) });
  },
});

/** How many versions a panel id still has (a removed panel must leave none). */
export const versionCount = internalQuery({
  args: { panelId: v.string() },
  handler: async (ctx, { panelId }) => {
    fixtures();
    const id = ctx.db.normalizeId("v2Panels", panelId);
    if (!id) return 0;
    return (await ctx.db.query("v2PanelVersions").withIndex("by_panel_version", q => q.eq("panelId", id)).take(200)).length;
  },
});
