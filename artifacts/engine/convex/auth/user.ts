/**
 * The current caller for UIs and clients:
 *   query auth/user:me ({}) → null when signed out, else
 *     {subject, name, scope, isAdmin, roomId?, permission?, credentialId?, label?}
 */
import { query } from "../_generated/server";
import { getViewer } from "./access";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      subject: viewer.subject, name: viewer.name, scope: viewer.scope, isAdmin: viewer.isAdmin,
      ...(viewer.scope === "player"
        ? { roomId: viewer.roomId, permission: viewer.permission, credentialId: viewer.credentialId, label: viewer.label }
        : {}),
    };
  },
});
