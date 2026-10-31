/**
 * Who is calling a panel function, and whether they may write.
 *
 * Public functions resolve the caller from ctx.auth (getViewer); the internal `<fn>As` twins, which the agent
 * registry calls, take `principal: {credentialId}` and resolve it the way getViewer resolves a player JWT. Panels
 * belong to the human (`viewer.subject`) across rooms, so a credential bound to any room of that human reaches
 * them. Writers: browser sessions and act/owner credentials. Read credentials only read; AI seats have no viewer.
 */
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireViewer, type Viewer } from "../auth/access";
import { fail } from "../lib/errors";

type Ctx = QueryCtx | MutationCtx;
export const principal = v.object({ credentialId: v.id("credentials") });
export type Principal = Infer<typeof principal>;
export type Author = Doc<"panelVersions">["author"];

/**
 * The Viewer a credential acts as: the same checks as getViewer's player path (the credential exists, is not
 * revoked or expired, and its human still exists). Throws UNAUTHENTICATED otherwise.
 */
export async function viewerForPrincipal(ctx: Ctx, { credentialId }: Principal): Promise<Viewer> {
  const credential = await ctx.db.get(credentialId);
  const user = credential && await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", credential.subject)).unique();
  if (!credential || !user || credential.revokedAt !== undefined || credential.expiresAt <= Date.now()) {
    fail("UNAUTHENTICATED", "This credential was revoked or has expired");
  }
  return {
    subject: user.subject, name: user.name, scope: "player", roomId: credential.roomId, permission: credential.permission,
    credentialId: credential._id, label: credential.label, isAdmin: false,
  };
}

/** The caller: a principal when an internal twin passes one, else the authenticated session or player JWT. */
export const resolveViewer = (ctx: Ctx, as?: Principal): Promise<Viewer> => as ? viewerForPrincipal(ctx, as) : requireViewer(ctx);

export function requireWriter(viewer: Viewer): void {
  if (viewer.scope === "browser") return;
  if (viewer.permission !== "act" && viewer.permission !== "owner") fail("FORBIDDEN", "A read-only credential cannot change panels");
}

const KINDS = new Set(["device", "oauth", "assistant"]);
/** The author recorded on a version: the human's name in a browser, else the credential's kind and label. */
export async function authorOf(ctx: Ctx, viewer: Viewer): Promise<Author> {
  if (viewer.scope === "browser") return { kind: "browser", label: viewer.name };
  const credential = viewer.credentialId ? await ctx.db.get(viewer.credentialId as Id<"credentials">) : null;
  // Credential kinds arrive with the agent interface (docs/surface-architecture.md §3); rows without one are devices.
  const kind = (credential as { kind?: string } | null)?.kind;
  return { kind: kind && KINDS.has(kind) ? kind as Author["kind"] : "device", label: (viewer.label ?? "player app").slice(0, 80) };
}
