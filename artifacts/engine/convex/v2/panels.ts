/**
 * Stored panels: a human's own UI panels as TSX, compiled on save and rendered by every client of theirs in a
 * sandboxed frame with `@sdk` version 2 (integration plan §4.2 `v2Panels`). The operations are the directory's
 * `panel.*` (ops/panel.ts); this module holds the store they share and the app's two live reads:
 *
 *   list   the caller's panels (metadata, no code), one index page of `v2Panels`
 *   code   one version's source and compiled code (default: the current one), or null when there is none
 *
 * Panels belong to the human (`userId`) across rooms; another human's panels are never visible or addressable.
 * `panel.save` checks the caller and limits first (`precheck`), compiles in Node (panelCompile.ts) and commits in a
 * mutation that re-checks everything (`commit`); a compile error returns diagnostics and commits nothing.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { AI_PRINCIPAL, requireUser, userById } from "./access";
import { outcome } from "./commands";
import { authorV, bytes, diagnosticV, kb, LIMITS, manifestV, placementV, sizeV, SLUG, type Author } from "./panelShapes";

// ------------------------------------------------------------------------------------------------ the store

/** The human whose panels a caller reaches: AI players have none. */
export function panelOwner(userId: string | null): string {
  if (!userId) throw new OpFailure("Sign in first.");
  if (userId.startsWith(AI_PRINCIPAL)) throw new OpFailure("AI players have no panels.");
  return userId;
}

export function checkSlug(slug: string): void {
  if (!SLUG.test(slug)) throw new OpFailure(`A panel slug is kebab-case: lowercase letters, digits and dashes, 1–48 characters ("${slug.slice(0, 60)}" is not).`);
}

export async function findPanel(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<"v2Panels"> | null> {
  return ctx.db.query("v2Panels").withIndex("by_user_slug", q => q.eq("userId", userId).eq("slug", slug)).unique();
}
export async function requirePanel(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<"v2Panels">> {
  return (await findPanel(ctx, userId, slug)) ?? (() => { throw new OpFailure(`No panel "${slug}".`, "panel.list"); })();
}
export async function versionOf(ctx: QueryCtx, panelId: Id<"v2Panels">, version: number): Promise<Doc<"v2PanelVersions"> | null> {
  return ctx.db.query("v2PanelVersions").withIndex("by_panel_version", q => q.eq("panelId", panelId).eq("version", version)).unique();
}
export async function requireVersion(ctx: QueryCtx, panel: Doc<"v2Panels">, version: number): Promise<Doc<"v2PanelVersions">> {
  return (await versionOf(ctx, panel._id, version))
    ?? (() => { throw new OpFailure(`Panel "${panel.slug}" has no version ${version} (the last ${LIMITS.versionsKept} are kept).`, "panel.list"); })();
}

/** Refuses past LIMITS.savesPerMinute; with `record` (a mutation), counts one more save. */
export async function quota(ctx: QueryCtx | MutationCtx, userId: string, record: boolean): Promise<void> {
  const doc = await ctx.db.query("v2PanelQuotas").withIndex("by_user", q => q.eq("userId", userId)).unique();
  const now = Date.now();
  const recent = (doc?.saves ?? []).filter(at => at > now - 60_000);
  if (recent.length >= LIMITS.savesPerMinute) throw new OpFailure(`At most ${LIMITS.savesPerMinute} panel saves a minute; try again shortly.`);
  if (!record) return;
  const saves = [...recent, now], db = (ctx as MutationCtx).db;
  if (doc) await db.patch(doc._id, { saves });
  else await db.insert("v2PanelQuotas", { userId, saves });
}

/** Inserts version `version` and prunes versions older than the last LIMITS.versionsKept. */
export async function addVersion(ctx: MutationCtx, panelId: Id<"v2Panels">, version: number, row: Omit<Doc<"v2PanelVersions">, "_id" | "_creationTime" | "panelId" | "version">): Promise<void> {
  await ctx.db.insert("v2PanelVersions", { panelId, version, ...row });
  const stale = await ctx.db.query("v2PanelVersions").withIndex("by_panel_version", q => q.eq("panelId", panelId).lte("version", version - LIMITS.versionsKept)).take(100);
  for (const doc of stale) await ctx.db.delete(doc._id);
}

/** The author of a write: the human in a browser, or a delegate (named by its grant when it has one). */
export async function authorOf(ctx: QueryCtx, userId: string, delegate: string | null): Promise<Author> {
  if (delegate !== null) return { kind: "delegate", label: delegate.slice(0, 80) };
  return { kind: "browser", label: ((await userById(ctx, userId))?.name ?? "you").slice(0, 80) };
}

/** The checks that need no code (the slug, the panel count, the rate); re-run by `commit`. */
async function checkSave(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<"v2Panels"> | null> {
  checkSlug(slug);
  const existing = await findPanel(ctx, userId, slug);
  if (!existing) {
    const count = (await ctx.db.query("v2Panels").withIndex("by_user_slug", q => q.eq("userId", userId)).take(LIMITS.panels)).length;
    if (count >= LIMITS.panels) throw new OpFailure(`At most ${LIMITS.panels} panels per player; remove one first.`, "panel.remove");
  }
  await quota(ctx, userId, false);
  return existing;
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

// ------------------------------------------------------------------------------------------------ save: precheck → compile → commit

export const precheck = internalQuery({
  args: { userId: v.string(), slug: v.string() },
  handler: (ctx, { userId, slug }) => outcome(async () => { await checkSave(ctx, userId, slug); return null; }),
});

export const commit = internalMutation({
  args: {
    userId: v.string(), delegate: v.union(v.string(), v.null()), slug: v.string(), source: v.string(),
    title: v.optional(v.string()), placement: v.optional(placementV), size: v.optional(sizeV),
    compiled: v.string(), manifest: manifestV, compilerVersion: v.string(), sourceHash: v.string(),
  },
  handler: (ctx, a) => outcome(async () => {
    const existing = await checkSave(ctx, a.userId, a.slug);
    if (bytes(a.compiled) > LIMITS.compiledBytes)
      throw new OpFailure(`The compiled panel is ${kb(bytes(a.compiled))}; the limit is ${kb(LIMITS.compiledBytes)}. Make the source smaller.`);
    await quota(ctx, a.userId, true);
    const author = await authorOf(ctx, a.userId, a.delegate);
    const foreign = author.kind !== "browser";
    const now = Date.now(), version = (existing?.currentVersion ?? 0) + 1;
    const fields = {
      title: (a.title ?? a.manifest.title ?? existing?.title ?? a.slug).slice(0, 80),
      placement: a.placement ?? a.manifest.placement ?? existing?.placement ?? "right",
      size: a.size ?? a.manifest.size ?? existing?.size ?? "md",
      currentVersion: version, updatedAt: now, author, lastForeignVersion: foreign ? version : existing?.lastForeignVersion ?? 0,
    };
    const panelId = existing?._id ?? await ctx.db.insert("v2Panels", { userId: a.userId, slug: a.slug, enabled: true, sdk: 2, ...fields });
    if (existing) await ctx.db.patch(existing._id, fields);
    await addVersion(ctx, panelId, version, {
      source: a.source, compiled: a.compiled, diagnostics: [], compilerVersion: a.compilerVersion, sourceHash: a.sourceHash,
      author, manifest: a.manifest, createdAt: now, foreign,
    });
    return { version };
  }),
});
