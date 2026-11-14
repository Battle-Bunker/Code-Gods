/**
 * `panel.*`: the human's stored panels (convex/v2/panels.ts). Every operation acts on the caller's own panels, across
 * rooms; another human's are answered as if they did not exist ("No panel …"). Saving compiles in Node, so
 * `panel.save` is an action: precheck (query) → compile (Node action) → commit (mutation, which re-checks).
 */
import { makeFunctionReference } from "convex/server";
import { OpFailure } from "@workspace/v2-affordances";
import { failureOf } from "../commands";
import type { CompileResult } from "../panelCompile";
import { addVersion, authorOf, codeOf, listPanels, panelOwner, quota, requirePanel, requireVersion } from "../panels";
import { bytes, kb, LIMITS } from "../panelShapes";
import { callerOf, defineOp, type V2Caller } from "./define";

const PRECHECK = makeFunctionReference<"query", { userId: string; slug: string }, null>("v2/panels:precheck");
const COMPILE = makeFunctionReference<"action", { source: string }, CompileResult>("v2/panelCompile:compile");
const COMMIT = makeFunctionReference<"mutation", Record<string, unknown>, { version: number }>("v2/panels:commit");

/** Who writes: null for the human at the app, else the surface acting for them (the assistant, MCP, the CLI). */
const delegateOf = (c: V2Caller): string | null =>
  c.via === "app" ? null : `${c.via === "assistant" ? "assistant" : c.via === "mcp" ? "remote assistant" : "CLI"}${c.ctx.grant ? ` (${c.ctx.grant})` : ""}`;

async function guarded<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { throw failureOf(e); }
}

export const { op: list, as: listAs } = defineOp("panel.list", "query", async env => ({
  panels: await listPanels(env.ctx, panelOwner(callerOf(env).userId)),
}));

export const { op: code, as: codeAs } = defineOp("panel.code", "query", async (env, a) => {
  const panel = await requirePanel(env.ctx, panelOwner(callerOf(env).userId), a.slug);
  return codeOf(a.slug, await requireVersion(env.ctx, panel, a.version ?? panel.currentVersion));
});

export const { op: save, as: saveAs } = defineOp("panel.save", "action", async (env, a) => {
  const c = callerOf(env), userId = panelOwner(c.userId);
  if (bytes(a.source) > LIMITS.sourceBytes) throw new OpFailure(`Panel source is ${kb(bytes(a.source))}; the limit is ${kb(LIMITS.sourceBytes)}.`);
  await guarded(() => env.ctx.runQuery(PRECHECK, { userId, slug: a.slug }));
  const result = await env.ctx.runAction(COMPILE, { source: a.source });
  if (!result.ok) return { saved: false, slug: a.slug, version: null, diagnostics: result.diagnostics };
  const { version } = await guarded(() => env.ctx.runMutation(COMMIT, {
    userId, delegate: delegateOf(c), slug: a.slug, source: a.source,
    ...(a.title !== undefined ? { title: a.title } : {}), ...(a.placement ? { placement: a.placement } : {}), ...(a.size ? { size: a.size } : {}),
    compiled: result.compiled, manifest: result.manifest, compilerVersion: result.compilerVersion, sourceHash: result.sourceHash,
  }));
  return { saved: true, slug: a.slug, version, diagnostics: result.diagnostics };
});

export const { op: rollback, as: rollbackAs } = defineOp("panel.rollback", "mutation", async (env, a) => {
  const c = callerOf(env), userId = panelOwner(c.userId), ctx = env.ctx;
  const panel = await requirePanel(ctx, userId, a.slug);
  const old = await requireVersion(ctx, panel, a.version);
  await quota(ctx, userId, true);
  const author = await authorOf(ctx, userId, delegateOf(c));
  const now = Date.now(), next = panel.currentVersion + 1;
  // Restoring code a delegate wrote makes delegate code current again, whoever rolls back.
  const foreign = author.kind !== "browser" || old.foreign;
  await ctx.db.patch(panel._id, {
    currentVersion: next, updatedAt: now, author, title: old.manifest.title ?? panel.title,
    placement: old.manifest.placement ?? panel.placement, size: old.manifest.size ?? panel.size,
    lastForeignVersion: foreign ? next : panel.lastForeignVersion,
  });
  await addVersion(ctx, panel._id, next, {
    source: old.source, compiled: old.compiled, diagnostics: old.diagnostics, compilerVersion: old.compilerVersion,
    sourceHash: old.sourceHash, author, manifest: old.manifest, createdAt: now, foreign,
  });
  return { slug: a.slug, version: next, from: a.version };
});

export const { op: setEnabled, as: setEnabledAs } = defineOp("panel.setEnabled", "mutation", async (env, a) => {
  const panel = await requirePanel(env.ctx, panelOwner(callerOf(env).userId), a.slug);
  if (panel.enabled !== a.enabled) await env.ctx.db.patch(panel._id, { enabled: a.enabled, updatedAt: Date.now() });
  return { ok: true as const };
});

export const { op: remove, as: removeAs } = defineOp("panel.remove", "mutation", async (env, a) => {
  const panel = await requirePanel(env.ctx, panelOwner(callerOf(env).userId), a.slug);
  const versions = await env.ctx.db.query("v2PanelVersions").withIndex("by_panel_version", q => q.eq("panelId", panel._id)).take(LIMITS.versionsKept + 50);
  for (const doc of versions) await env.ctx.db.delete(doc._id);
  await env.ctx.db.delete(panel._id);
  return { ok: true as const };
});
