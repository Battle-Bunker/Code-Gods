/**
 * Who is calling a panel function, and whether they may write.
 *
 * Public functions resolve the caller from ctx.auth (getViewer); the internal `<fn>As` twins, which the agent
 * registry calls, take `principal: {credentialId}` and resolve it as every internal twin does (lib/rooms.ts viewerOf). Panels
 * belong to the human (`viewer.subject`) across rooms, so a credential bound to any room of that human reaches
 * them. Writers: browser sessions and act/owner credentials. Read credentials only read; AI seats have no viewer.
 */
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Viewer } from "../auth/access";
import { fail } from "../lib/errors";
import { credentialKind } from "../auth/principal";

type Ctx = QueryCtx | MutationCtx;
/** The caller: a principal when an internal twin passes one, else ctx.auth (lib/rooms.ts viewerOf). */
export { principalV as principal, viewerOf as resolveViewer, type Principal } from "../lib/rooms";
export type Author = Doc<"panelVersions">["author"];

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
