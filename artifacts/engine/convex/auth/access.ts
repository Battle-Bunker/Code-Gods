/**
 * The access contract every game function uses (owned by convex/auth; game code only calls it).
 *
 * A caller is identified by a JWT this deployment minted (auth.config.ts):
 *   scope "browser": a signed-in human on the engine site (full rights of that human); the JWT's
 *                    session (`sid`) is checked on every call, so logout is immediate;
 *   scope "player":  a player app or room assistant holding a scoped credential for ONE room, with a
 *                    permission: "read" < "act" < "owner". The credential is checked for revocation on
 *                    every call (an indexed point read), so revocation is immediate.
 *
 * God ids in game tables are strings: a human's Replit subject (`sub`), or "ai:<uuid>" for an AI seat.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { oidcIssuer } from "./config";
import { credentialKind, credentialProblem, type CredentialKind } from "./principal";

export type Permission = "read" | "act" | "owner";
export type Viewer = {
  /** The human's Replit subject: the god id in game tables. */
  subject: string;
  /** Full verified name. */
  name: string;
  scope: "browser" | "player";
  /** Player scope only: the room the credential is bound to, its permission and id. */
  roomId?: string;
  permission?: Permission;
  credentialId?: string;
  /** Self-reported label of a player credential (never a verified identity). */
  label?: string;
  /** Verified-email admin (browser scope only). */
  isAdmin: boolean;
  /** Player scope from viewerForCredential: who holds the credential (device flow, MCP OAuth, in-client assistant). */
  credentialKind?: CredentialKind;
};

const RANK: Record<Permission, number> = { read: 0, act: 1, owner: 2 };

export function isAdminEmail(email: string | undefined, verified: boolean): boolean {
  if (!verified || !email) return false;
  const allowed = (process.env.CODE_GODS_ADMIN_EMAILS ?? "").split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Admin = verified email on the allowlist, persisted at login from the CONFIGURED OIDC issuer's
 * signed claims (production: https://replit.com/oidc), as before.
 */
export function isAdminUser(user: Pick<Doc<"users">, "email" | "emailVerified" | "issuer">): boolean {
  return user.issuer === oidcIssuer() && isAdminEmail(user.email, user.emailVerified);
}

/** The authenticated caller, or null. Revoked or expired credentials and unknown users yield null. */
export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", identity.subject)).unique();
  if (!user) return null;
  const scope = identity.scope === "player" ? "player" : identity.scope === "browser" ? "browser" : null;
  if (!scope) return null;
  if (scope === "browser") {
    // Browser JWTs name their session (`sid`), so logout takes effect at once, not after the JWT's 10 minutes.
    const sessionId = typeof identity.sid === "string" ? ctx.db.normalizeId("sessions", identity.sid) : null;
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    if (!session || session.subject !== user.subject || session.expiresAt <= Date.now()) return null;
    return { subject: user.subject, name: user.name, scope, isAdmin: isAdminUser(user) };
  }
  const credentialId = typeof identity.cred === "string" ? identity.cred : null;
  const id = credentialId ? ctx.db.normalizeId("credentials", credentialId) : null;
  const credential = id ? await ctx.db.get(id) : null;
  if (!credential || credential.subject !== user.subject || credential.revokedAt !== undefined || credential.expiresAt <= Date.now() ||
    (credential.refreshExpiresAt !== undefined && credential.refreshExpiresAt <= Date.now())) return null;
  return {
    subject: user.subject, name: user.name, scope, roomId: credential.roomId, permission: credential.permission,
    credentialId: credential._id as Id<"credentials">, label: credential.label, isAdmin: false,
  };
}

/** Throws ConvexError {code: "UNAUTHENTICATED"} without a valid caller. */
export async function requireViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Please log in (or reconnect this player app)" });
  return viewer;
}

/**
 * Throws unless the caller may use `need` on this room. Browser scope always passes (membership and
 * ownership are the game module's checks); player scope must be bound to `roomId` with at least `need`.
 * "owner" additionally requires the human to be the room's CURRENT owner: the game module checks that.
 */
export function requireRoomPermission(viewer: Viewer, roomId: string, need: Permission): void {
  if (viewer.scope === "browser") return;
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
 * The Viewer of a principal `{credentialId}` (tool executions, scheduled commands), after the same checks
 * as a player JWT plus `credentialProblem`. Null when unknown or unusable.
 */
export async function viewerForCredential(ctx: QueryCtx | MutationCtx, credentialId: string): Promise<Viewer | null> {
  const id = ctx.db.normalizeId("credentials", credentialId);
  const credential = id ? await ctx.db.get(id) : null;
  if (!credential) return null;
  const roomId = ctx.db.normalizeId("rooms", credential.roomId);
  const room = roomId ? await ctx.db.get(roomId) : null;
  if (credentialProblem(credential, room, Date.now())) return null;
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", credential.subject)).unique();
  if (!user) return null;
  return {
    subject: user.subject, name: user.name, scope: "player", roomId: credential.roomId, permission: credential.permission,
    credentialId: credential._id, label: credential.label, isAdmin: false, credentialKind: credentialKind(credential),
  };
}

/** viewerForCredential, or ConvexError {code: "UNAUTHENTICATED"}. */
export async function requireViewerFor(ctx: QueryCtx | MutationCtx, principal: { credentialId: string }): Promise<Viewer> {
  const viewer = await viewerForCredential(ctx, principal.credentialId);
  if (!viewer) throw new ConvexError({ code: "UNAUTHENTICATED", message: "This connection was revoked or has expired; reconnect" });
  return viewer;
}
