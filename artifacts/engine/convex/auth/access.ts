/**
 * The access contract every game function uses (owned by convex/auth; game code only calls it).
 *
 * A caller is identified by a Convex JWT from one of two issuers (auth.config.ts), told apart by issuer only
 * (identity.ts tokenKind):
 *   scope "browser": Better Auth (issuer CONVEX_SITE_URL), a signed-in human on the engine site (full rights
 *                    of that human). The JWT's Better Auth session (`sessionId`) must still exist and be
 *                    unexpired on every call, so sign-out is immediate.
 *   scope "player":  our player JWT (issuer CONVEX_SITE_URL/api/device): a player app or room assistant holding
 *                    a scoped credential for ONE room, with a permission: "read" < "act" < "owner". The
 *                    credential is checked for revocation on every call, so revocation is immediate.
 *   scope "account": our player JWT for an account grant (OAuth `scope=account`, docs/external-clients.md): an app
 *                    on any origin acting as its human everywhere, exactly as the browser session does, except for
 *                    the consent surface (approving devices and connections, listing and revoking credentials) and
 *                    admin, which stay with the browser session on the engine's own site. Revocable like any credential.
 *
 * Rights come from the human's identity, not from which app they run (actsAsHuman): a browser session and an account
 * grant are the same human everywhere; a room credential is that human in one room with one permission.
 *
 * God ids in game tables are strings: a human's Better Auth user id, or "ai:<uuid>" for an AI seat.
 */
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { convexSiteUrl } from "./config";
import { isAdminUser, tokenKind } from "./identity";
import { credentialKind, credentialProblem, type CredentialKind } from "./principal";

export type Permission = "read" | "act" | "owner";
/** What a credential grants: one room with a Permission, or the human's whole account ("account"). */
export type Grant = Permission | "account";
export type Viewer = {
  /** The human's god id (Better Auth user id). */
  subject: string;
  /** Full verified name. */
  name: string;
  scope: "browser" | "player" | "account";
  /** Player scope only: the room the credential is bound to, its permission and id. */
  roomId?: string;
  permission?: Permission;
  credentialId?: string;
  /** Self-reported label of a player credential (never a verified identity). */
  label?: string;
  /** Verified Google email on the admin allowlist (browser scope only). */
  isAdmin: boolean;
  /** Player scope: who holds the credential (device flow, MCP OAuth, in-client assistant). */
  credentialKind?: CredentialKind;
};

const RANK: Record<Permission, number> = { read: 0, act: 1, owner: 2 };

/** The Better Auth session a browser JWT names, if it still exists, is unexpired and belongs to `subject`. */
async function liveSession(ctx: QueryCtx | MutationCtx, sessionId: unknown, subject: string): Promise<boolean> {
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 64) return false;
  const session = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "session",
    where: [{ field: "_id", value: sessionId }, { field: "expiresAt", operator: "gt", value: Date.now() }],
  }) as { userId?: string } | null;
  return !!session && session.userId === subject;
}

/** The authenticated caller, or null. Ended sessions, revoked or expired credentials and unknown users yield null. */
export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const scope = tokenKind(identity.issuer, convexSiteUrl());
  if (!scope) return null;
  if (scope === "browser") {
    const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", identity.subject)).unique();
    if (!user || !(await liveSession(ctx, identity.sessionId, user.subject))) return null;
    return { subject: user.subject, name: user.name, scope, isAdmin: isAdminUser(user, process.env) };
  }
  // A player JWT names its credential (`cred`): the same rules as any principal (viewerForCredential), for the JWT's own human.
  if (typeof identity.cred !== "string") return null;
  const viewer = await viewerForCredential(ctx, identity.cred);
  return viewer && viewer.subject === identity.subject ? viewer : null;
}

/** The human everywhere (a browser session or an account grant), not a credential bound to one room. */
export const actsAsHuman = (viewer: Viewer) => viewer.scope !== "player";

/** Throws ConvexError {code: "UNAUTHENTICATED"} without a valid caller. */
export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Please sign in (or reconnect this player app)" });
  return viewer;
}

/**
 * Throws unless the caller may use `need` on this room. The human everywhere always passes (membership and
 * ownership are the game module's checks); player scope must be bound to `roomId` with at least `need`.
 * "owner" additionally requires the human to be the room's CURRENT owner: the game module checks that.
 */
export function requireRoomPermission(viewer: Viewer, roomId: string, need: Permission): void {
  if (actsAsHuman(viewer)) return;
  if (viewer.roomId !== roomId) throw new ConvexError({ code: "FORBIDDEN", message: "This credential is bound to a different room" });
  if (RANK[viewer.permission ?? "read"] < RANK[need]) {
    throw new ConvexError({ code: "FORBIDDEN", message: need === "act" ? "Read-only authorization cannot submit commands" : "This needs an owner grant approved by the room owner" });
  }
}

// ---------------------------------------------------------------------------------------------
// Principals (docs/surface-architecture.md §3): a credential id → the same Viewer a player JWT gives
// ---------------------------------------------------------------------------------------------

export { credentialKind, credentialProblem, type CredentialKind };

/**
 * The Viewer of a principal `{credentialId}` (tool executions, scheduled commands) and of a player JWT (getViewer):
 * the one place a credential's validity is decided (`credentialProblem`: revoked, expired, room gone, owner grant
 * of a human who no longer owns the room). Null when unknown or unusable.
 */
export async function viewerForCredential(ctx: QueryCtx | MutationCtx, credentialId: string): Promise<Viewer | null> {
  const id = ctx.db.normalizeId("credentials", credentialId);
  const credential = id ? await ctx.db.get(id) : null;
  if (!credential) return null;
  const room = credential.roomId ? await credentialRoom(ctx, credential.roomId) : null;
  if (credentialProblem(credential, room, Date.now())) return null;
  // A room credential acts for a member: someone who has left the room (its owner included) holds nothing there.
  if (credential.roomId && !await credentialRoomMember(ctx, credential.roomId, credential.subject)) return null;
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", credential.subject)).unique();
  if (!user) return null;
  if (credential.permission === "account") {
    return { subject: user.subject, name: user.name, scope: "account", credentialId: credential._id, label: credential.label, isAdmin: false, credentialKind: credentialKind(credential) };
  }
  return {
    subject: user.subject, name: user.name, scope: "player", roomId: credential.roomId, permission: credential.permission,
    credentialId: credential._id, label: credential.label, isAdmin: false, credentialKind: credentialKind(credential),
  };
}

/**
 * The room a credential is bound to: a v2 room (engine v2; its MCP tools are generated from the
 * affordance directory, agent/mcpV2.ts). Both carry `ownerId` as the owner's subject.
 */
export async function credentialRoom(ctx: QueryCtx | MutationCtx, roomId: string): Promise<{ ownerId: string; code: string | null } | null> {
  const v2 = ctx.db.normalizeId("v2Rooms", roomId);
  if (v2) { const r = await ctx.db.get(v2); return r ? { ownerId: r.ownerId, code: r.code } : null; }
  return null;   // a v1 room's credential: its room is gone (archive/engine-v1)
}

/** Whether `subject` is a member of a credential's room (`v2Members`). */
export async function credentialRoomMember(ctx: QueryCtx | MutationCtx, roomId: string, subject: string): Promise<boolean> {
  const v2 = ctx.db.normalizeId("v2Rooms", roomId);
  if (v2) return !!await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", v2).eq("userId", subject)).first();
  return false;
}

/** viewerForCredential, or ConvexError {code: "UNAUTHENTICATED"}. */
export async function requireViewerFor(ctx: QueryCtx | MutationCtx, principal: { credentialId: string }): Promise<Viewer> {
  const viewer = await viewerForCredential(ctx, principal.credentialId);
  if (!viewer) throw new ConvexError({ code: "UNAUTHENTICATED", message: "This connection was revoked or has expired; reconnect" });
  return viewer;
}
