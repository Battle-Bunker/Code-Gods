/**
 * Stored panels' store (v2/panels.ts describes the whole): the checks and writes the `panel.*` operations share
 * (ops/panel.ts), and the save's transactional halves. Kept apart from the app's live reads in v2/panels.ts so those
 * page queries do not load this module's imports.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { codeOf, findPanel, listPanels, metadata, versionOf } from "./panels";
import { AI_PRINCIPAL, userById } from "./access";
import { outcome } from "./failure";
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

export async function requirePanel(ctx: QueryCtx, userId: string, slug: string): Promise<Doc<"v2Panels">> {
  return (await findPanel(ctx, userId, slug)) ?? (() => { throw new OpFailure(`No panel "${slug}".`, "panel.list"); })();
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
