/**
 * Stored panels: a human's custom UI panels as TSX in Convex (docs/panels.md "Stored panels").
 *
 *   list, code                                 read (any caller of that human, read credentials included)
 *   save, rollback, setEnabled, remove         write (browser sessions and act/owner credentials)
 *
 * Where a panel shows is the dock layout's business (convex/layout.ts): `placement` and `size` are kept as the
 * add-pane hints a panel's manifest gives.
 *
 * Every function has an internal twin `<fn>As` taking `principal: {credentialId}` for the agent registry. Panels
 * belong to the caller's human across rooms; another human's panels are never visible or addressable (NOT_FOUND).
 *
 * `save` checks the caller and limits first, compiles in a Node action (convex/panels/compile.ts), and commits in
 * a mutation that re-checks everything; a compile error returns diagnostics and commits nothing.
 */
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { authorOf, principal, requireWriter, resolveViewer, type Author, type Principal } from "./panels/access";
import { LIMITS, SLUG, kb } from "./panels/limits";
import { diagnostic, manifest as manifestValidator, placement, size } from "./panels/tables";

type Ctx = QueryCtx | MutationCtx;
type Diagnostic = Infer<typeof diagnostic>;
const bytes = (text: string) => new TextEncoder().encode(text).length;

function checkSlug(slug: string) {
  if (!SLUG.test(slug)) fail("BAD_REQUEST", `A panel slug is kebab-case: lowercase letters, digits and dashes, 1–48 characters ("${slug.slice(0, 60)}" is not)`);
}
async function findPanel(ctx: Ctx, subject: string, slug: string) {
  return ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", subject).eq("slug", slug)).unique();
}
async function requirePanel(ctx: Ctx, subject: string, slug: string) {
  return (await findPanel(ctx, subject, slug)) ?? fail("NOT_FOUND", `No panel "${slug}"`);
}
async function versionOf(ctx: Ctx, panelId: Id<"panels">, version: number) {
  return ctx.db.query("panelVersions").withIndex("by_panel_version", q => q.eq("panelId", panelId).eq("version", version)).unique();
}

/** Throws RATE_LIMITED past LIMITS.savesPerMinute; with `record`, counts one more save. */
async function quota(ctx: Ctx, subject: string, record: boolean) {
  const doc = await ctx.db.query("panelQuotas").withIndex("by_subject", q => q.eq("subject", subject)).unique();
  const now = Date.now();
  const recent = (doc?.saves ?? []).filter(at => at > now - 60_000);
  if (recent.length >= LIMITS.savesPerMinute) fail("RATE_LIMITED", `At most ${LIMITS.savesPerMinute} panel saves a minute; try again shortly`);
  if (!record) return;
  const saves = [...recent, now];
  const db = (ctx as MutationCtx).db;
  if (doc) await db.patch(doc._id, { saves });
  else await db.insert("panelQuotas", { subject, saves });
}

const metadata = (p: Doc<"panels">) => ({
  id: p._id, slug: p.slug, title: p.title, placement: p.placement, size: p.size, currentVersion: p.currentVersion, enabled: p.enabled,
  updatedAt: p.updatedAt, author: p.author, lastForeignVersion: p.lastForeignVersion ?? 0,
});

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------

async function listImpl(ctx: Ctx, viewer: Viewer) {
  const rows = await ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", viewer.subject)).take(LIMITS.panels + 8);
  return rows.map(metadata);
}
const codeArgs = { slug: v.string(), version: v.optional(v.number()) };
async function codeImpl(ctx: Ctx, viewer: Viewer, { slug, version }: { slug: string; version?: number }) {
  const panel = await requirePanel(ctx, viewer.subject, slug);
  const row = await versionOf(ctx, panel._id, version ?? panel.currentVersion) ?? fail("NOT_FOUND", `Panel "${slug}" has no version ${version} (the last ${LIMITS.versionsKept} are kept)`);
  return {
    slug, version: row.version, source: row.source, compiled: row.compiled, diagnostics: row.diagnostics,
    compilerVersion: row.compilerVersion, sourceHash: row.sourceHash, author: row.author, createdAt: row.createdAt,
  };
}

/** Metadata of the caller's panels (no code). */
export const list = query({ args: {}, handler: async ctx => listImpl(ctx, await resolveViewer(ctx)) });
export const listAs = internalQuery({ args: { principal }, handler: async (ctx, a) => listImpl(ctx, await resolveViewer(ctx, a.principal)) });
/** One version's source and compiled code (default: the current version). */
export const code = query({ args: codeArgs, handler: async (ctx, a) => codeImpl(ctx, await resolveViewer(ctx), a) });
export const codeAs = internalQuery({ args: { principal, ...codeArgs }, handler: async (ctx, { principal: p, ...a }) => codeImpl(ctx, await resolveViewer(ctx, p), a) });

// ------------------------------------------------------------------------------------------------
// save: precheck → compile (Node) → commit
// ------------------------------------------------------------------------------------------------

const saveArgs = { slug: v.string(), source: v.string(), title: v.optional(v.string()), placement: v.optional(placement), size: v.optional(size) };
type SaveArgs = { slug: string; source: string; title?: string; placement?: Doc<"panels">["placement"]; size?: Doc<"panels">["size"] };
export type SaveResult = { ok: true; slug: string; version: number; diagnostics: Diagnostic[] } | { ok: false; slug: string; diagnostics: Diagnostic[] };

/** The checks that need no code: caller, writer, slug, panel count and rate (re-run by commit). */
async function checkSave(ctx: Ctx, viewer: Viewer, slug: string) {
  requireWriter(viewer);
  checkSlug(slug);
  const existing = await findPanel(ctx, viewer.subject, slug);
  if (!existing) {
    const count = (await ctx.db.query("panels").withIndex("by_subject_slug", q => q.eq("subject", viewer.subject)).take(LIMITS.panels)).length;
    if (count >= LIMITS.panels) fail("BAD_REQUEST", `At most ${LIMITS.panels} panels per player; remove one first`);
  }
  await quota(ctx, viewer.subject, false);
  return existing;
}

export const precheck = internalQuery({
  args: { principal: v.optional(principal), slug: v.string() },
  handler: async (ctx, { principal: p, slug }) => { await checkSave(ctx, await resolveViewer(ctx, p), slug); return null; },
});

/** Insert version `version` of a panel and prune versions older than the last LIMITS.versionsKept. */
async function addVersion(ctx: MutationCtx, panelId: Id<"panels">, version: number, row: Omit<Doc<"panelVersions">, "_id" | "_creationTime" | "panelId" | "version">) {
  await ctx.db.insert("panelVersions", { panelId, version, ...row });
  const stale = await ctx.db.query("panelVersions").withIndex("by_panel_version", q => q.eq("panelId", panelId).lte("version", version - LIMITS.versionsKept)).take(100);
  for (const doc of stale) await ctx.db.delete(doc._id);
}

const foreignVersion = (author: Author, version: number, previous?: number) => author.kind === "browser" ? previous : version;

export const commit = internalMutation({
  args: {
    principal: v.optional(principal), ...saveArgs, compiled: v.string(), diagnostics: v.array(diagnostic), manifest: manifestValidator,
    compilerVersion: v.string(), sourceHash: v.string(),
  },
  handler: async (ctx, { principal: p, slug, source, title, placement: where, size: howBig, compiled, diagnostics, manifest, compilerVersion, sourceHash }) => {
    const viewer = await resolveViewer(ctx, p);
    const existing = await checkSave(ctx, viewer, slug);
    await quota(ctx, viewer.subject, true);
    const author = await authorOf(ctx, viewer);
    const now = Date.now();
    const version = (existing?.currentVersion ?? 0) + 1;
    const fields = {
      title: (title ?? manifest.title ?? existing?.title ?? slug).slice(0, 80),
      placement: where ?? manifest.placement ?? existing?.placement ?? "right",
      size: howBig ?? manifest.size ?? existing?.size ?? "md",
      currentVersion: version, updatedAt: now, author, lastForeignVersion: foreignVersion(author, version, existing?.lastForeignVersion),
    };
    const panelId = existing?._id ?? await ctx.db.insert("panels", { subject: viewer.subject, slug, enabled: true, ...fields });
    if (existing) await ctx.db.patch(existing._id, fields);
    await addVersion(ctx, panelId, version, { source, compiled, diagnostics, compilerVersion, sourceHash, author, manifest, createdAt: now, foreign: author.kind !== "browser" });
    return { ok: true as const, slug, version, diagnostics };
  },
});

async function runSave(ctx: ActionCtx, as: Principal | undefined, args: SaveArgs): Promise<SaveResult> {
  checkSlug(args.slug);
  if (bytes(args.source) > LIMITS.sourceBytes) fail("BAD_REQUEST", `Panel source is ${kb(bytes(args.source))}; the limit is ${kb(LIMITS.sourceBytes)}.`);
  await ctx.runQuery(internal.panels.precheck, { principal: as, slug: args.slug });
  const result = await ctx.runAction(internal.panels.compile.compile, { source: args.source });
  if (!result.ok) return { ok: false, slug: args.slug, diagnostics: result.diagnostics };
  return ctx.runMutation(internal.panels.commit, {
    principal: as, ...args, compiled: result.compiled, diagnostics: result.diagnostics, manifest: result.manifest,
    compilerVersion: result.compilerVersion, sourceHash: result.sourceHash,
  });
}

/**
 * Compile and store a new version of the caller's panel `slug` (created on first save). Returns
 * {ok: true, version, diagnostics} or, when it does not compile, {ok: false, diagnostics: [{line, column, code, message}]}.
 * title / placement / size override the literal definePanel manifest.
 */
export const save = action({ args: saveArgs, handler: (ctx, args): Promise<SaveResult> => runSave(ctx, undefined, args) });
export const saveAs = internalAction({ args: { principal, ...saveArgs }, handler: (ctx, { principal: p, ...args }): Promise<SaveResult> => runSave(ctx, p, args) });

// ------------------------------------------------------------------------------------------------
// other writes
// ------------------------------------------------------------------------------------------------

async function writer(ctx: MutationCtx, as: Principal | undefined) {
  const viewer = await resolveViewer(ctx, as);
  requireWriter(viewer);
  return viewer;
}

const rollbackArgs = { slug: v.string(), version: v.number() };
async function rollbackImpl(ctx: MutationCtx, viewer: Viewer, { slug, version }: { slug: string; version: number }) {
  const panel = await requirePanel(ctx, viewer.subject, slug);
  const old = await versionOf(ctx, panel._id, version) ?? fail("NOT_FOUND", `Panel "${slug}" has no version ${version} (the last ${LIMITS.versionsKept} are kept)`);
  await quota(ctx, viewer.subject, true);
  const author = await authorOf(ctx, viewer);
  const now = Date.now();
  const next = panel.currentVersion + 1;
  const foreign = author.kind !== "browser" || (old.foreign ?? old.author.kind !== "browser");
  await ctx.db.patch(panel._id, {
    currentVersion: next, updatedAt: now, author, title: old.manifest.title ?? panel.title,
    placement: old.manifest.placement ?? panel.placement, size: old.manifest.size ?? panel.size,
    // Restoring code an agent wrote makes agent code current again, whoever rolls back.
    lastForeignVersion: foreign ? next : panel.lastForeignVersion,
  });
  await addVersion(ctx, panel._id, next, {
    source: old.source, compiled: old.compiled, diagnostics: old.diagnostics, compilerVersion: old.compilerVersion,
    sourceHash: old.sourceHash, author, manifest: old.manifest, createdAt: now, foreign,
  });
  return { slug, version: next, from: version };
}
/** Make an older version current again (as a new version with that code). */
export const rollback = mutation({ args: rollbackArgs, handler: async (ctx, a) => rollbackImpl(ctx, await writer(ctx, undefined), a) });
export const rollbackAs = internalMutation({ args: { principal, ...rollbackArgs }, handler: async (ctx, { principal: p, ...a }) => rollbackImpl(ctx, await writer(ctx, p), a) });

const enabledArgs = { slug: v.string(), enabled: v.boolean() };
async function setEnabledImpl(ctx: MutationCtx, viewer: Viewer, { slug, enabled }: { slug: string; enabled: boolean }) {
  const panel = await requirePanel(ctx, viewer.subject, slug);
  await ctx.db.patch(panel._id, { enabled, updatedAt: Date.now() });
  return null;
}
/** Show or hide a panel in every client (it stays stored). */
export const setEnabled = mutation({ args: enabledArgs, handler: async (ctx, a) => setEnabledImpl(ctx, await writer(ctx, undefined), a) });
export const setEnabledAs = internalMutation({ args: { principal, ...enabledArgs }, handler: async (ctx, { principal: p, ...a }) => setEnabledImpl(ctx, await writer(ctx, p), a) });

const removeArgs = { slug: v.string() };
async function removeImpl(ctx: MutationCtx, viewer: Viewer, { slug }: { slug: string }) {
  const panel = await requirePanel(ctx, viewer.subject, slug);
  const versions = await ctx.db.query("panelVersions").withIndex("by_panel_version", q => q.eq("panelId", panel._id)).take(LIMITS.versionsKept + 50);
  for (const doc of versions) await ctx.db.delete(doc._id);
  await ctx.db.delete(panel._id);
  return null;
}
/** Delete a panel and all its versions. */
export const remove = mutation({ args: removeArgs, handler: async (ctx, a) => removeImpl(ctx, await writer(ctx, undefined), a) });
export const removeAs = internalMutation({ args: { principal, ...removeArgs }, handler: async (ctx, { principal: p, ...a }) => removeImpl(ctx, await writer(ctx, p), a) });
