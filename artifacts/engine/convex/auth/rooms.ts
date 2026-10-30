/**
 * The only room facts auth reads from game tables: does the room exist, its short code, its CURRENT
 * owner, and whether a human is a member. Everything else about rooms belongs to convex/game.
 */
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { findRoom } from "../lib/rooms";

export type RoomFacts = { roomId: string; shortCode: string; ownerId: string };
const facts = (room: Doc<"rooms">): RoomFacts => ({ roomId: room._id, shortCode: room.shortCode, ownerId: room.ownerId });

/**
 * Resolve a room reference exactly as the rest of the engine does (lib/rooms findRoom: a Convex id, the
 * GUID, or the short code in any case, dashes ignored, with Crockford's O→0 and I/L→1). Null when unknown or malformed.
 */
export async function resolveRoom(ctx: QueryCtx, ref: unknown): Promise<RoomFacts | null> {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 64) return null;
  const room = await findRoom(ctx, ref.trim());
  return room ? facts(room) : null;
}

/**
 * Membership for device approval. The owner is always a member. Other members are read from the game
 * module's `members` table through an index `by_room_user` on [roomId, userId] when it exists. Until it
 * does (or if its shape differs), this fails closed: only the owner can approve. Approval never grants
 * more than the human has, since every game function re-checks membership itself.
 * INTEGRATION POINT: if convex/game names the table or index differently, change only this function.
 */
export async function isRoomMember(ctx: QueryCtx, room: RoomFacts, subject: string): Promise<boolean> {
  if (room.ownerId === subject) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.db as any;
    const row = await db.query("members").withIndex("by_room_user", (q: any) => q.eq("roomId", room.roomId).eq("userId", subject)).first();
    return row !== null;
  } catch {
    return false;
  }
}
