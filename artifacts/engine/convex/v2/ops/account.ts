/** `account.*`: who am I, connected assistants (shared credentials, M3), and the consent screen's approval. */
import { OpFailure } from "@workspace/v2-affordances";
import { normalizeUserCode, sha256Hex } from "../../auth/crypto";
import { memberOf, roomById } from "../access";
import type { MutationCtx } from "../../_generated/server";
import { oauthRequest } from "../oauth";
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
 * Consent (the human's own click; the directory refuses every delegate). Two kinds of request:
 *
 * - A device code (8 letters and digits): its room comes with it. The permission may be lowered, never raised; an
 *   owner grant needs the room's current owner. The device claims its credential on its next poll (auth/device.ts).
 * - An OAuth request (an MCP client's /oauth/authorize, with the browser's one-time `completion` secret): the human
 *   chooses the room (`room`), lowers or keeps the permission, and gives explicit consent to an owner grant
 *   (`ownerConsent`) or to an account grant (`accountConsent`: the app acts as them in every room, approved as asked
 *   or not at all). The browser then collects the code at /oauth/authorize/complete with the same secret, which is
 *   what keeps someone who merely knows the request key from collecting it (agent/connect.ts explains).
 */
export const { op: approveConnection, as: approveConnectionAs } = defineOp("account.approveConnection", "mutation", async (env, a) => {
  const userId = callerOf(env).userId!, ctx = env.ctx;
  if (a.completion !== undefined) return await approveOAuth(ctx, userId, { ...a, completion: a.completion });
  if (a.grant === "account") throw new OpFailure("A device code connects one room; an account grant is only for OAuth requests.");
  const code = normalizeUserCode(a.request);
  if (!code) throw new OpFailure("That is not a device code (8 letters and digits).", "An app's OAuth request also needs the browser's completion secret: approve it on the connect page.");
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

async function approveOAuth(ctx: MutationCtx, userId: string, a: {
  request: string; grant: "read" | "act" | "owner" | "account"; room?: string; completion: string; ownerConsent?: boolean; accountConsent?: boolean;
}) {
  const request = await oauthRequest(ctx, a.request);
  if (!request || request.status !== "pending" || request.expiresAt <= Date.now()) throw new OpFailure("Invalid or expired connection request.");
  const completionHash = await sha256Hex(a.completion);
  if ((request.permission === "account") !== (a.grant === "account")) {
    throw new OpFailure(request.permission === "account" ? "The app asked to act as you in every room: approve that or deny it." : "A room connection cannot be approved for every room.");
  }
  if (a.grant === "account") {
    if (a.accountConsent !== true) throw new OpFailure("Acting as you in every room needs your explicit consent: the app can join and create rooms, play and run the rooms you own.", "Pass accountConsent: true.");
    await ctx.db.patch(request._id, { status: "approved", subject: userId, grantedPermission: "account", completionHash });
    return { ok: true as const };
  }
  if (RANK[a.grant] > RANK[request.permission as keyof typeof RANK]) throw new OpFailure(`The app asked for ${request.permission}: you may lower the permission, not raise it.`);
  if (!a.room) throw new OpFailure("Choose the room the app acts in.");
  const room = await roomById(ctx, a.room) ?? await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", a.room!.toUpperCase())).first();
  if (!room || !await memberOf(ctx, room._id, userId)) throw new OpFailure("Join this room first.", "room.join");
  if (a.grant === "owner") {
    if (room.ownerId !== userId) throw new OpFailure("Only the room's current owner can approve an owner grant.");
    if (a.ownerConsent !== true) throw new OpFailure("An owner grant needs your explicit consent: it can configure the room and its AI quotas, start and end games and play as you.", "Pass ownerConsent: true.");
  }
  await ctx.db.patch(request._id, { status: "approved", subject: userId, roomId: room._id, grantedPermission: a.grant, completionHash });
  return { ok: true as const };
}

/** Consent too: refuses a pending OAuth request (by its key) or device code, so the app gets nothing. */
export const { op: denyConnection, as: denyConnectionAs } = defineOp("account.denyConnection", "mutation", async (env, a) => {
  const userId = callerOf(env).userId!, ctx = env.ctx, now = Date.now();
  const request = await oauthRequest(ctx, a.request);
  if (request) {
    if (request.status !== "pending" || request.expiresAt <= now) throw new OpFailure("Invalid or expired connection request.");
    await ctx.db.patch(request._id, { status: "denied", subject: userId });
    return { ok: true as const };
  }
  const code = normalizeUserCode(a.request);
  const userCodeHash = code ? await sha256Hex(code) : null;
  const device = userCodeHash ? await ctx.db.query("devices").withIndex("by_user_code", q => q.eq("userCodeHash", userCodeHash)).first() : null;
  if (!device || device.status !== "pending" || device.expiresAt <= now) throw new OpFailure("Invalid or expired connection request.");
  await ctx.db.patch(device._id, { status: "denied" });
  return { ok: true as const };
});
