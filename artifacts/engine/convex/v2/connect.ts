/**
 * The /connect page's read of one OAuth request (an MCP client asking to act for the human), so it can offer the
 * choice `account.approveConnection` / `account.denyConnection` decide: the client's self-reported name (not a verified
 * identity), where the browser returns, the grant asked for, the room the client hinted, the caller's v2 rooms to
 * choose from, and the expiry. Sign-in required; a request another human already decided reads as null.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { MAX_MEMBERS, requireUser, roomById } from "./access";
import { oauthRequest } from "./oauth";

const grantV = v.union(v.literal("read"), v.literal("act"), v.literal("owner"), v.literal("account"));
const roomRowV = v.object({ roomId: v.id("v2Rooms"), code: v.string(), name: v.string(), owner: v.boolean() });
const hostOf = (uri: string) => { try { return new URL(uri).hostname; } catch { return "(invalid)"; } };

export const pending = query({
  args: { request: v.string() },
  returns: v.union(v.null(), v.object({
    clientName: v.string(), redirectHost: v.string(), grant: grantV,
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("issued"), v.literal("redeemed"), v.literal("expired")),
    expiresAt: v.number(), rooms: v.array(roomRowV),
    /** The room the client asked for, when it is a v2 room: preselected; `member` false means join it first. */
    hint: v.union(v.object({ ...roomRowV.fields, member: v.boolean() }), v.null()),
  })),
  handler: async (ctx, { request: key }) => {
    const user = await requireUser(ctx);
    const request = await oauthRequest(ctx, key);
    if (!request || (request.subject && request.subject !== user.userId)) return null;
    const memberships = await ctx.db.query("v2Members").withIndex("by_user", q => q.eq("userId", user.userId)).order("desc").take(MAX_MEMBERS * 2);
    const rooms = [];
    for (const m of memberships) {
      const room = await ctx.db.get(m.roomId);
      if (room) rooms.push({ roomId: room._id, code: room.code, name: room.name, owner: room.ownerId === user.userId });
    }
    const hinted = request.roomHint ? await roomById(ctx, request.roomHint) ?? await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", request.roomHint!.toUpperCase())).first() : null;
    return {
      clientName: request.clientName, redirectHost: hostOf(request.redirectUri), grant: request.permission,
      status: request.status === "pending" && request.expiresAt <= Date.now() ? "expired" as const : request.status,
      expiresAt: request.expiresAt, rooms,
      hint: hinted ? { roomId: hinted._id, code: hinted.code, name: hinted.name, owner: hinted.ownerId === user.userId, member: rooms.some(r => r.roomId === hinted._id) } : null,
    };
  },
});
