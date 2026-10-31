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
import { requireViewer, requireViewerFor, type Viewer } from "../auth/access";
import { fail } from "../lib/errors";
import { credentialKind } from "../auth/principal";

type Ctx = QueryCtx | MutationCtx;
export { principalV as principal, type Principal } from "../lib/rooms";
import type { Principal } from "../lib/rooms";
export type Author = Doc<"panelVersions">["author"];

/** The Viewer a credential acts as (auth/access.ts viewerForCredential: revoked, expired, room gone, owner no longer current). */
export const viewerForPrincipal = (ctx: Ctx, principal: Principal): Promise<Viewer> => requireViewerFor(ctx, principal);

/** The caller: a principal when an internal twin passes one, else the authenticated session or player JWT. */
export const resolveViewer = (ctx: Ctx, as?: Principal): Promise<Viewer> => as ? viewerForPrincipal(ctx, as) : requireViewer(ctx);

export function requireWriter(viewer: Viewer): void {
  if (viewer.scope === "browser") return;
  if (viewer.permission !== "act" && viewer.permission !== "owner") fail("FORBIDDEN", "A read-only credential cannot change panels");
}

/** The author recorded on a version: the human's name in a browser, else the credential's kind and label. */
export async function authorOf(ctx: Ctx, viewer: Viewer): Promise<Author> {
  if (viewer.scope === "browser") return { kind: "browser", label: viewer.name };
  const credential = viewer.credentialId ? await ctx.db.get(viewer.credentialId as Id<"credentials">) : null;
  return { kind: credential ? credentialKind(credential) : "device", label: (viewer.label ?? "player app").slice(0, 80) };
}
