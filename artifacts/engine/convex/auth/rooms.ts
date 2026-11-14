/**
 * The only room facts auth reads from game tables: does the room exist, its code, its CURRENT owner, and whether a
 * human is a member. Rooms are engine v2's (v2Rooms, v2Members); everything else about them belongs to convex/v2.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type RoomFacts = { roomId: string; shortCode: string; ownerId: string };
const facts = (room: Doc<"v2Rooms">): RoomFacts => ({ roomId: room._id, shortCode: room.code, ownerId: room.ownerId });

/** A room by Convex id or by its code (any case, dashes and spaces ignored). */
export async function findRoom(ctx: QueryCtx, ref: string): Promise<Doc<"v2Rooms"> | null> {
  const id = ctx.db.normalizeId("v2Rooms", ref);
  if (id) return ctx.db.get(id);
  const code = ref.toUpperCase().replace(/[-\s]/g, "");
  return ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", code)).first();
}

/** Resolve a room reference (lib findRoom: a Convex id or the code). Null when unknown or malformed. */
export async function resolveRoom(ctx: QueryCtx, ref: unknown): Promise<RoomFacts | null> {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 64) return null;
  const room = await findRoom(ctx, ref.trim());
  return room ? facts(room) : null;
}

/** Whether `subject` is a member of the room (the owner always is). Approval never grants more than the human has. */
export async function isRoomMember(ctx: QueryCtx, room: RoomFacts, subject: string): Promise<boolean> {
  if (room.ownerId === subject) return true;
  const row = await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", room.roomId as Id<"v2Rooms">).eq("userId", subject)).first();
  return row !== null;
}
