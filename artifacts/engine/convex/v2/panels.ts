/**
 * Stored panels: a human's own UI panels as TSX, compiled on save and rendered by every client of theirs in a
 * sandboxed frame with `@sdk` version 2 (integration plan §4.2 `v2Panels`). The operations are the directory's
 * `panel.*` (ops/panel.ts); the store they share is panelStore.ts; this module holds the app's two live reads (light, for page queries):
 *
 *   list   the caller's panels (metadata, no code), one index page of `v2Panels`
 *   code   one version's source and compiled code (default: the current one), or null when there is none
 *
 * Panels belong to the human (`userId`) across rooms; another human's panels are never visible or addressable.
 * `panel.save` checks the caller and limits first (`precheck`), compiles in Node (panelCompile.ts) and commits in a
 * mutation that re-checks everything (`commit`); a compile error returns diagnostics and commits nothing.
 */
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireUser } from "./access";
import { authorV, diagnosticV, LIMITS, placementV, sizeV } from "./panelShapes";

export async function findPanel(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<"v2Panels"> | null> {
  return ctx.db.query("v2Panels").withIndex("by_user_slug", q => q.eq("userId", userId).eq("slug", slug)).unique();
}
export async function versionOf(ctx: QueryCtx, panelId: Id<"v2Panels">, version: number): Promise<Doc<"v2PanelVersions"> | null> {
  return ctx.db.query("v2PanelVersions").withIndex("by_panel_version", q => q.eq("panelId", panelId).eq("version", version)).unique();
}

export const metadataV = v.object({
  panelId: v.id("v2Panels"), slug: v.string(), title: v.string(), placement: placementV, size: sizeV, currentVersion: v.number(),
  enabled: v.boolean(), updatedAt: v.number(), author: authorV, lastForeignVersion: v.number(),
});
export const metadata = (p: Doc<"v2Panels">) => ({
  panelId: p._id, slug: p.slug, title: p.title, placement: p.placement, size: p.size, currentVersion: p.currentVersion,
  enabled: p.enabled, updatedAt: p.updatedAt, author: p.author, lastForeignVersion: p.lastForeignVersion,
});
export const codeV = v.object({
  slug: v.string(), version: v.number(), source: v.string(), compiled: v.string(), diagnostics: v.array(diagnosticV),
  compilerVersion: v.string(), sourceHash: v.string(), author: authorV, createdAt: v.number(),
});
export const codeOf = (slug: string, row: Doc<"v2PanelVersions">) => ({
  slug, version: row.version, source: row.source, compiled: row.compiled, diagnostics: row.diagnostics,
  compilerVersion: row.compilerVersion, sourceHash: row.sourceHash, author: row.author, createdAt: row.createdAt,
});

export async function listPanels(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db.query("v2Panels").withIndex("by_user_slug", q => q.eq("userId", userId)).take(LIMITS.panels + 8);
  return rows.map(metadata);
}

// ------------------------------------------------------------------------------------------------ the app's live reads

/** The caller's panels (metadata, no code). */
export const list = query({
  args: {},
  returns: v.array(metadataV),
  handler: async ctx => listPanels(ctx, (await requireUser(ctx)).userId),
});

/** One version of one of the caller's panels (default: the current one); null when there is no such panel or version. */
export const code = query({
  args: { slug: v.string(), version: v.optional(v.number()) },
  returns: v.union(codeV, v.null()),
  handler: async (ctx, { slug, version }) => {
    const { userId } = await requireUser(ctx);
    const panel = await findPanel(ctx, userId, slug);
    const row = panel ? await versionOf(ctx, panel._id, version ?? panel.currentVersion) : null;
    return row ? codeOf(slug, row) : null;
  },
});

