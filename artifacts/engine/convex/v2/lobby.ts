/** Rooms and seats: creating and joining a room (W3-1); the deal and the start arrive in W3-3. */
import { OpFailure } from "@workspace/v2-affordances";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_MEMBERS, userById } from "./access";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A short join code nobody else holds (6 characters of an unambiguous alphabet: 2^30). */
async function freshCode(ctx: MutationCtx): Promise<string> {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", code)).first()) return code;
  }
}

async function nameOf(ctx: MutationCtx, userId: string) {
  return (await userById(ctx, userId))?.name ?? "Player";
}

export async function createRoom(ctx: MutationCtx, userId: string, o: { name?: string; preset: string }) {
  const name = await nameOf(ctx, userId), now = Date.now(), code = await freshCode(ctx);
  const roomId = await ctx.db.insert("v2Rooms", {
    code, name: o.name ?? `${name}'s room`, ownerId: userId, revision: 0, createdAt: now, preset: o.preset, overrides: {}, games: 0,
  });
  await ctx.db.insert("v2Members", { roomId, kind: "human", name, spectator: false, joinedAt: now, userId });
  return { roomId, code };
}

export async function joinRoom(ctx: MutationCtx, userId: string, rawCode: string): Promise<Id<"v2Rooms">> {
  const code = rawCode.trim().toUpperCase();
  const room = await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", code)).first();
  if (!room) throw new OpFailure(`No room has the code ${code}.`);
  const existing = await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", room._id).eq("userId", userId)).first();
  if (existing) return room._id;
  const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  if (members.length >= MAX_MEMBERS) throw new OpFailure(`This room is full (${MAX_MEMBERS} members).`);
  // Joining a game in progress makes a spectator; the next game seats them.
  await ctx.db.insert("v2Members", { roomId: room._id, kind: "human", name: await nameOf(ctx, userId), spectator: !!room.gameId, joinedAt: Date.now(), userId });
  await ctx.db.patch(room._id, { revision: room.revision + 1 });
  return room._id;
}
