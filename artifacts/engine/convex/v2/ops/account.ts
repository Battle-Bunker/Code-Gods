/** `account.*`: who am I, connected assistants (shared credentials, M3), and the consent screen's approval. */
import { OpFailure } from "@workspace/v2-affordances";
import { callerOf, defineOp, notYet } from "./define";

export const { op: whoami, as: whoamiAs } = defineOp("account.whoami", "query", async env => {
  const caller = callerOf(env);
  const user = await env.ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", caller.userId!)).unique();
  return { userId: caller.userId!, name: user?.name ?? "", roomId: caller.boundRoom, grant: caller.ctx.grant ?? null };
});
/**
 * The human's connected assistants and devices (the shared `credentials`): active ones, newest first. An account grant
 * (an app acting as the human in every room) is listed with no room and grant "owner", the widest the directory names.
 */
export const { op: connections, as: connectionsAs } = defineOp("account.connections", "query", async env => {
  const userId = callerOf(env).userId!, now = Date.now();
  const rows = await env.ctx.db.query("credentials").withIndex("by_subject", q => q.eq("subject", userId)).order("desc").take(200);
  return {
    connections: rows.filter(r => r.revokedAt === undefined && r.expiresAt > now).map(r => ({
      connectionId: r._id, client: r.label, roomId: r.roomId ?? null,
      grant: r.permission === "account" ? "owner" as const : r.permission, lastUsedAt: r.lastUsedAt ?? null,
    })),
  };
});

/** Revokes one of the human's connections at once (every call checks `revokedAt`). */
export const { op: revokeConnection, as: revokeConnectionAs } = defineOp("account.revokeConnection", "mutation", async (env, a) => {
  const userId = callerOf(env).userId!;
  const id = env.ctx.db.normalizeId("credentials", a.connectionId);
  const row = id ? await env.ctx.db.get(id) : null;
  if (!row || row.subject !== userId) throw new OpFailure("No such connection.", "account.connections");
  if (row.revokedAt === undefined) await env.ctx.db.patch(row._id, { revokedAt: Date.now() });
  return { ok: true as const };
});
export const { op: approveConnection, as: approveConnectionAs } = defineOp("account.approveConnection", "mutation", () => notYet("W3-6"));
