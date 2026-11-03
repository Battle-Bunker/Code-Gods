/**
 * The current caller for UIs and clients:
 *   query auth/user:me ({}) → null when signed out, else
 *     {subject, name, scope, isAdmin, roomId?, permission?, credentialId?, label?}
 * An action that serves only signed-in callers starts with `ctx.runQuery(internal.auth.user.requireSignedIn, {})`
 * (sign-in is required for everything on the site, owner decision 2026-11-02).
 */
import { internalQuery, query } from "../_generated/server";
import { getViewer, requireViewer } from "./access";

/** Throws UNAUTHENTICATED unless the caller (the action's identity) is signed in. */
export const requireSignedIn = internalQuery({ args: {}, handler: async (ctx) => { await requireViewer(ctx); return null; } });

export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      subject: viewer.subject, name: viewer.name, scope: viewer.scope, isAdmin: viewer.isAdmin,
      ...(viewer.scope === "player"
        ? { roomId: viewer.roomId, permission: viewer.permission, credentialId: viewer.credentialId, label: viewer.label }
        : viewer.scope === "account" ? { credentialId: viewer.credentialId, label: viewer.label } : {}),
    };
  },
});
