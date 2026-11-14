/** `account.*`: who am I, connected assistants (shared credentials, M3), and the consent screen's approval. */
import { OpFailure } from "@workspace/v2-affordances";
import { normalizeUserCode, sha256Hex } from "../../auth/crypto";
import { memberOf, roomById } from "../access";
import { callerOf, defineOp } from "./define";

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
const RANK = { read: 0, act: 1, owner: 2 } as const;

/**
 * Consent (the human's own click; the directory refuses every delegate): approves a pending device request for a v2
 * room by its user code, with the permission lowered or kept, never raised; an owner grant needs the room's current
 * owner. The device then claims its credential on its next poll (auth/device.ts). An OAuth request carries a browser
 * completion secret and a room choice this affordance has no parameters for yet: it is approved on /connect.
 */
export const { op: approveConnection, as: approveConnectionAs } = defineOp("account.approveConnection", "mutation", async (env, a) => {
  const userId = callerOf(env).userId!, ctx = env.ctx;
  const code = normalizeUserCode(a.request);
  if (!code) throw new OpFailure("That is not a device code (8 letters and digits).", "Approve an app's connection on the connect page.");
  const userCodeHash = await sha256Hex(code);
  const device = await ctx.db.query("devices").withIndex("by_user_code", q => q.eq("userCodeHash", userCodeHash)).first();
  if (!device || device.status !== "pending" || device.subject || device.expiresAt <= Date.now()) throw new OpFailure("Invalid or expired approval code.");
  const room = await roomById(ctx, device.roomId) ?? await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", device.roomId.toUpperCase())).first();
  if (!room) throw new OpFailure("That code is not for a room of this game.");
  if (!await memberOf(ctx, room._id, userId)) throw new OpFailure("Join this room first.", "room.join");
  if (RANK[a.grant] > RANK[device.permission]) throw new OpFailure(`The app asked for ${device.permission}: you may lower the permission, not raise it.`);
  if (a.grant === "owner" && room.ownerId !== userId) throw new OpFailure("Only the room's current owner can approve an owner grant.");
  await ctx.db.patch(device._id, { status: "approved", subject: userId, permission: a.grant });
  return { ok: true as const };
});
