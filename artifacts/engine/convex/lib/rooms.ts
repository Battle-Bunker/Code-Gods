/** Room resolution, membership and ownership checks, short codes and loaders (queries and mutations). */
import { encodeUuid } from "@workspace/game-core";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { requireRoomPermission, requireViewer, requireViewerFor, type Permission, type Viewer } from "../auth/access";
import { fail } from "./errors";
import { IDLE_MS } from "./world";

type Ctx = QueryCtx | MutationCtx;

/** Who is acting: a human viewer (browser or player credential) or an AI seat (engine-internal only). */
export type Actor = { godId: string; name: string; kind: "human" | "ai"; viewer?: Viewer };

/** A room by Convex id, GUID, or short code (case-insensitive; O→0, I/L→1 as Crockford). */
/** A typed short code in canonical form: any case, dashes and spaces ignored, Crockford's O→0 and I/L→1. */
const shortCodeOf = (ref: string) => ref.toUpperCase().replace(/[-\s]/g, "").replaceAll("O", "0").replace(/[IL]/g, "1");

export async function findRoom(ctx: Ctx, ref: string): Promise<Doc<"rooms"> | null> {
  const id = ctx.db.normalizeId("rooms", ref);
  if (id) return ctx.db.get(id);
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ctx.db.query("rooms").withIndex("by_guid", q => q.eq("guid", ref.toLowerCase())).unique();
  const code = shortCodeOf(ref);
  return ctx.db.query("rooms").withIndex("by_short_code", q => q.eq("shortCode", code)).unique();
}
export async function requireRoom(ctx: Ctx, ref: string): Promise<Doc<"rooms">> {
  return (await findRoom(ctx, ref)) ?? fail("NOT_FOUND", "Room not found");
}
export async function findGame(ctx: Ctx, ref: string): Promise<Doc<"games"> | null> {
  const id = ctx.db.normalizeId("games", ref);
  if (id) return ctx.db.get(id);
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ctx.db.query("games").withIndex("by_guid", q => q.eq("guid", ref.toLowerCase())).unique();
  const code = shortCodeOf(ref);
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
  return requireMemberAs(ctx, await requireViewer(ctx), room, need);
}
/** requireMember for an already resolved viewer (from ctx.auth, or a principal through viewerForCredential). */
export async function requireMemberAs(ctx: Ctx, viewer: Viewer, room: Doc<"rooms">, need: Permission): Promise<{ viewer: Viewer; member: Doc<"members">; actor: Actor }> {
  requireRoomPermission(viewer, room._id, need);
  const member = await memberOf(ctx, room._id, viewer.subject);
  if (!member) fail("FORBIDDEN", "Join this room first");
  return { viewer, member, actor: { godId: viewer.subject, name: member.name, kind: "human", viewer } };
}
/** The browser owner, or an `owner` credential approved for this room, who is the room's CURRENT owner. */
export async function requireOwner(ctx: Ctx, room: Doc<"rooms">) {
  return requireOwnerAs(ctx, await requireViewer(ctx), room);
}
export async function requireOwnerAs(ctx: Ctx, viewer: Viewer, room: Doc<"rooms">) {
  const found = await requireMemberAs(ctx, viewer, room, "owner");
  if (room.ownerId !== found.viewer.subject) fail("FORBIDDEN", "Room owner access required");
  return found;
}
/** Read access to a room's public state: browser humans, or a player credential bound to this room. */
export async function requireReader(ctx: Ctx, room: Doc<"rooms">): Promise<Viewer> {
  return requireReaderAs(await requireViewer(ctx), room);
}
export function requireReaderAs(viewer: Viewer, room: Doc<"rooms">): Viewer {
  requireRoomPermission(viewer, room._id, "read");
  return viewer;
}

/** A tool execution's principal (docs/surface-architecture.md §3). */
export type Principal = { credentialId: string };
export const principalV = v.object({ credentialId: v.string() });
/** The caller's viewer: from a principal when given (internal twins), else from ctx.auth. */
export async function viewerOf(ctx: Ctx, principal?: Principal): Promise<Viewer> {
  return principal ? requireViewerFor(ctx, principal) : requireViewer(ctx);
}

export async function displayName(ctx: Ctx, godId: string): Promise<string> {
  if (godId.startsWith("ai:")) return godId;
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", godId)).unique();
  return user?.name ?? godId;
}

/** The public utility catalog stored under `key` ("room:<id>" or "game:<id>"), or null. */
export async function getCatalog(ctx: Ctx, key: string) {
  return (await ctx.db.query("catalogs").withIndex("by_key", q => q.eq("key", key)).unique())?.catalog ?? null;
}
export async function putCatalog(ctx: MutationCtx, key: string, catalog: unknown, revision: number) {
  const doc = await ctx.db.query("catalogs").withIndex("by_key", q => q.eq("key", key)).unique();
  if (doc) await ctx.db.patch(doc._id, { catalog, revision });
  else await ctx.db.insert("catalogs", { key, catalog, revision });
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
