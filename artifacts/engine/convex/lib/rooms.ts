/** Room resolution, membership and ownership checks, short codes and loaders (queries and mutations). */
import { encodeUuid } from "@workspace/game-core";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireRoomPermission, requireViewer, type Permission, type Viewer } from "../auth/access";
import { fail } from "./errors";
import { IDLE_MS } from "./world";

type Ctx = QueryCtx | MutationCtx;

/** Who is acting: a human viewer (browser or player credential) or an AI seat (engine-internal only). */
export type Actor = { godId: string; name: string; kind: "human" | "ai"; viewer?: Viewer };

/** A room by Convex id, GUID, or short code (case-insensitive; O→0, I/L→1 as Crockford). */
export async function findRoom(ctx: Ctx, ref: string): Promise<Doc<"rooms"> | null> {
  const id = ctx.db.normalizeId("rooms", ref);
  if (id) return ctx.db.get(id);
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ctx.db.query("rooms").withIndex("by_guid", q => q.eq("guid", ref.toLowerCase())).unique();
  const code = ref.trim().toUpperCase().replaceAll("O", "0").replace(/[IL]/g, "1");
  return ctx.db.query("rooms").withIndex("by_short_code", q => q.eq("shortCode", code)).unique();
}
export async function requireRoom(ctx: Ctx, ref: string): Promise<Doc<"rooms">> {
  return (await findRoom(ctx, ref)) ?? fail("NOT_FOUND", "Room not found");
}
export async function findGame(ctx: Ctx, ref: string): Promise<Doc<"games"> | null> {
  const id = ctx.db.normalizeId("games", ref);
  if (id) return ctx.db.get(id);
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ctx.db.query("games").withIndex("by_guid", q => q.eq("guid", ref.toLowerCase())).unique();
  const code = ref.trim().toUpperCase().replaceAll("O", "0").replace(/[IL]/g, "1");
  return ctx.db.query("games").withIndex("by_short_code", q => q.eq("shortCode", code)).unique();
}

/**
 * The shortest prefix (≥ 4) of the GUID's Crockford encoding that is unique among existing codes and is
 * not a prefix of another GUID's encoding. Codes resolve exactly and never change, so a shared link keeps
 * resolving to the same room or game.
 */
export async function shortCodeFor(ctx: MutationCtx, table: "rooms" | "games", guid: string) {
  const encoded = encodeUuid(guid);
  for (let length = 4; length <= 26; length++) {
    const prefix = encoded.slice(0, length);
    const sharing = await ctx.db.query(table).withIndex("by_encoded", q => q.gte("encoded", prefix).lt("encoded", `${prefix}~`)).first();
    const taken = await ctx.db.query(table).withIndex("by_short_code", q => q.eq("shortCode", prefix)).first();
    if (!sharing && !taken) return { shortCode: prefix, encoded };
  }
  return fail("CONFLICT", "Could not allocate a short code");
}

export async function memberOf(ctx: Ctx, roomId: Id<"rooms">, godId: string) {
  return ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", roomId).eq("godId", godId)).unique();
}
export async function membersOf(ctx: Ctx, roomId: Id<"rooms">) {
  return ctx.db.query("members").withIndex("by_room", q => q.eq("roomId", roomId)).take(16);
}

/** The viewer as an acting member of this room, with at least `need` (player credentials are room-bound). */
export async function requireMember(ctx: Ctx, room: Doc<"rooms">, need: Permission): Promise<{ viewer: Viewer; member: Doc<"members">; actor: Actor }> {
  const viewer = await requireViewer(ctx);
  requireRoomPermission(viewer, room._id, need);
  const member = await memberOf(ctx, room._id, viewer.subject);
  if (!member) fail("FORBIDDEN", "Join this room first");
  return { viewer, member, actor: { godId: viewer.subject, name: member.name, kind: "human", viewer } };
}
/** The browser owner, or an `owner` credential approved for this room, who is the room's CURRENT owner. */
export async function requireOwner(ctx: Ctx, room: Doc<"rooms">) {
  const found = await requireMember(ctx, room, "owner");
  if (room.ownerId !== found.viewer.subject) fail("FORBIDDEN", "Room owner access required");
  return found;
}
/** Read access to a room's public state: browser humans, or a player credential bound to this room. */
export async function requireReader(ctx: Ctx, room: Doc<"rooms">): Promise<Viewer> {
  const viewer = await requireViewer(ctx);
  requireRoomPermission(viewer, room._id, "read");
  return viewer;
}

export async function displayName(ctx: Ctx, godId: string): Promise<string> {
  if (godId.startsWith("ai:")) return godId;
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", godId)).unique();
  return user?.name ?? godId;
}

export async function lastHumanActivity(ctx: Ctx): Promise<number> {
  const doc = await ctx.db.query("activity").withIndex("by_key", q => q.eq("key", "global")).unique();
  return doc?.lastHumanActivityAt ?? 0;
}
export const isIdle = (lastActivity: number, now = Date.now()) => now - lastActivity >= IDLE_MS;

export async function recentChat(ctx: Ctx, roomId: Id<"rooms">, limit = 100, from = 0, to = Infinity) {
  const rows = await ctx.db.query("chat").withIndex("by_room", q => {
    const lower = q.eq("roomId", roomId).gte("timestamp", from);
    return Number.isFinite(to) ? lower.lte("timestamp", to) : lower;
  }).order("desc").take(limit);
  return rows.reverse();
}
