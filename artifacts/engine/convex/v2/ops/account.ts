/** `account.*`: who am I, connected assistants (shared credentials, M3), and the consent screen's approval. */
import { callerOf, defineOp, notYet } from "./define";

export const { op: whoami, as: whoamiAs } = defineOp("account.whoami", "query", async env => {
  const caller = callerOf(env);
  const user = await env.ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", caller.userId!)).unique();
  return { userId: caller.userId!, name: user?.name ?? "", roomId: caller.boundRoom, grant: caller.ctx.grant ?? null };
});
export const { op: connections, as: connectionsAs } = defineOp("account.connections", "query", () => notYet("W3-6"));
export const { op: revokeConnection, as: revokeConnectionAs } = defineOp("account.revokeConnection", "mutation", () => notYet("W3-6"));
export const { op: approveConnection, as: approveConnectionAs } = defineOp("account.approveConnection", "mutation", () => notYet("W3-6"));
