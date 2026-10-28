/**
 * The only room facts auth reads from game tables: does the room exist, its short code, its CURRENT
 * owner, and whether a human is a member. Everything else about rooms belongs to convex/game.
 */
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type RoomFacts = { roomId: string; shortCode: string; ownerId: string };
const facts = (room: Doc<"rooms">): RoomFacts => ({ roomId: room._id, shortCode: room.shortCode, ownerId: room.ownerId });

/** Resolve a room id or short code (case-insensitive, dashes ignored). Null when unknown or malformed. */
export async function resolveRoom(ctx: QueryCtx, ref: unknown): Promise<RoomFacts | null> {
  if (typeof ref !== "string" || !ref.trim() || ref.length > 64) return null;
  const id = ctx.db.normalizeId("rooms", ref.trim());
  if (id) {
    const room = await ctx.db.get(id);
    return room ? facts(room) : null;
  }
  const code = ref.trim().replace(/-/g, "");
  if (!/^[A-Za-z0-9]{1,24}$/.test(code)) return null;
  for (const candidate of new Set([code, code.toUpperCase(), code.toLowerCase()])) {
    const room = await ctx.db.query("rooms").withIndex("by_short_code", q => q.eq("shortCode", candidate)).first();
    if (room) return facts(room);
  }
  return null;
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
