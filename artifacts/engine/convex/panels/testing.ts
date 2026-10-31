/** Test-only fixtures for test/game-panels.test.ts; refused unless CODE_GODS_DEV or CODE_GODS_TEST_FIXTURES is set. */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { fail } from "../lib/errors";

const dev = () => {
  if (process.env.CODE_GODS_DEV !== "1" && process.env.CODE_GODS_TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need CODE_GODS_DEV=1 or CODE_GODS_TEST_FIXTURES=1");
};

/** `count` minimal panels seeded-0 … for `subject` (bypasses compile and the rate limit). */
export const seedPanels = internalMutation({
  args: { subject: v.string(), count: v.number() },
  handler: async (ctx, { subject, count }) => {
    dev();
    const author = { kind: "browser" as const, label: "seed" };
    for (let i = 0; i < count; i++) {
      const panelId = await ctx.db.insert("panels", {
        subject, slug: `seeded-${i}`, title: `Seeded ${i}`, placement: "right", size: "md", currentVersion: 1, enabled: true, updatedAt: Date.now(), author,
      });
      await ctx.db.insert("panelVersions", {
        panelId, version: 1, source: "export default null;", compiled: "exports.default = null;", diagnostics: [], compilerVersion: "seed",
        sourceHash: "seed", author, manifest: {}, createdAt: Date.now(),
      });
    }
  },
});

/** Move a human's recorded save times `ms` into the past (rate-limit window). */
export const ageSaves = internalMutation({
  args: { subject: v.string(), ms: v.number() },
  handler: async (ctx, { subject, ms }) => {
    dev();
    const doc = await ctx.db.query("panelQuotas").withIndex("by_subject", q => q.eq("subject", subject)).unique();
    if (doc) await ctx.db.patch(doc._id, { saves: doc.saves.map(at => at - ms) });
  },
});

export const versionCount = internalQuery({
  args: { subject: v.string(), slug: v.string() },
  handler: async (ctx, { subject, slug }) => {
    dev();
    const panel = await ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", subject).eq("slug", slug)).unique();
    if (!panel) return 0;
    return (await ctx.db.query("panelVersions").withIndex("by_panel_version", q => q.eq("panelId", panel._id)).collect()).length;
  },
});

/** Versions whose panel no longer exists (a removed panel must leave none). */
export const orphanVersions = internalQuery({
  args: {},
  handler: async ctx => {
    dev();
    let orphans = 0;
    for (const row of await ctx.db.query("panelVersions").collect()) if (!(await ctx.db.get(row.panelId))) orphans++;
    return orphans;
  },
});

export const revoke = internalMutation({
  args: { credentialId: v.id("credentials") },
  handler: async (ctx, { credentialId }) => { dev(); await ctx.db.patch(credentialId, { revokedAt: Date.now() }); },
});
