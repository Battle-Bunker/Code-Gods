/**
 * Live room queries (integration plan §2.2). Writes are affordances in ops/room.ts, ops/chat.ts and ops/seats.ts.
 * Each reads one document or one index page, and requires sign-in and membership.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { MAX_MEMBERS, normaliseCode, requireMember, requireUser } from "./access";
import { chatPageV, historyPageV, roomListV, roomV, roundV } from "./validators";

/** The caller's rooms, newest joined first: a skeleton page; each row's component subscribes to `get`. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: roomListV,
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireUser(ctx);
    const page = await ctx.db.query("v2Members").withIndex("by_user", q => q.eq("userId", user.userId)).order("desc").paginate(paginationOpts);
    return { ...page, page: page.page.map(m => ({ roomId: m.roomId, memberId: m._id, joinedAt: m.joinedAt })) };
  },
});

async function head(ctx: QueryCtx, gameId: Doc<"v2Rooms">["gameId"]) {
  const game = gameId ? await ctx.db.get(gameId) : null;
  return game ? { gameId: game._id, number: game.number, phase: game.phase } : null;
}

export async function roomView(ctx: QueryCtx, room: Doc<"v2Rooms">, userId: string) {
  const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  const game = await head(ctx, room.gameId);
  const lastGame = room.lastGameId && room.lastGameId !== room.gameId ? await head(ctx, room.lastGameId) : game;
  return {
    roomId: room._id, code: room.code, name: room.name, ownerId: room.ownerId, revision: room.revision,
    preset: room.preset, overrides: room.overrides, phase: game?.phase ?? "lobby" as const,
    members: members.map(m => ({
      memberId: m._id, name: m.name, kind: m.kind, spectator: m.spectator, owner: !!m.userId && m.userId === room.ownerId, me: m.userId === userId,
    })),
    game, lastGame, bidding: room.bidding ?? null,
  };
}

export const get = query({
  args: { roomId: v.string() },
  returns: roomV,
  handler: async (ctx, { roomId }) => {
    const { user, room } = await requireMember(ctx, roomId);
    return await roomView(ctx, room, user.userId);
  },
});

/**
 * A room by its join code (invite links and the URL carry the code): its id and whether the caller is a member. Any
 * signed-in human holding the code may ask (the code is the invitation); null when no room has it.
 */
export const byCode = query({
  args: { code: v.string() },
  returns: v.union(v.object({ roomId: v.id("v2Rooms"), member: v.boolean() }), v.null()),
  handler: async (ctx, { code }) => {
    const user = await requireUser(ctx);
    const room = await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", normaliseCode(code))).first();
    if (!room) return null;
    const member = await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", room._id).eq("userId", user.userId)).first();
    return { roomId: room._id, member: !!member };
  },
});

export const chat = query({
  args: { roomId: v.string(), paginationOpts: paginationOptsValidator },
  returns: chatPageV,
  handler: async (ctx, { roomId, paginationOpts }) => {
    const { room } = await requireMember(ctx, roomId);
    const page = await ctx.db.query("v2Chat").withIndex("by_room", q => q.eq("roomId", room._id)).order("desc").paginate(paginationOpts);
    return { ...page, page: page.page.map(c => ({ id: c._id, from: c.from, memberId: c.memberId ?? null, text: c.text, at: c.at })) };
  },
});

/** The room's ended games, newest first. */
export const history = query({
  args: { roomId: v.string(), paginationOpts: paginationOptsValidator },
  returns: historyPageV,
  handler: async (ctx, { roomId, paginationOpts }) => {
    const { room } = await requireMember(ctx, roomId);
    const page = await ctx.db.query("v2Games").withIndex("by_room_phase", q => q.eq("roomId", room._id).eq("phase", "ended")).order("desc").paginate(paginationOpts);
    return { ...page, page: page.page.map(g => ({ gameId: g._id, number: g.number, endedAt: g.endedAt ?? null, winner: g.summary?.winner ?? null })) };
  },
});

/**
 * The room's current rotation round (integration plan §1, M3: "rotation across replays and running totals per seat"):
 * its ended games so far, newest first, and each seat's net total summed over them. Null when the last game was not
 * dealt in a rotation (a deal with a won bid). Reads at most a room's worth of game headers and their scoreboards.
 */
export const round = query({
  args: { roomId: v.string() },
  returns: roundV,
  handler: async (ctx, { roomId }) => {
    const { room } = await requireMember(ctx, roomId);
    const games = await ctx.db.query("v2Games").withIndex("by_room_phase", q => q.eq("roomId", room._id).eq("phase", "ended")).order("desc").take(MAX_MEMBERS);
    const inRound: Doc<"v2Games">[] = [];
    for (const g of games) {
      if (!g.rotates) break;
      inRound.push(g);
      if (!g.rotation) break;   // the round's first game: a fresh deal
    }
    if (inRound.length === 0) return null;
    const totals = new Map<string, { memberId: Doc<"v2Members">["_id"]; name: string; net: number }>();
    for (const g of inRound) {
      const s = await ctx.db.query("v2Standings").withIndex("by_game", q => q.eq("gameId", g._id)).unique();
      for (const r of s?.rows ?? []) {
        const t = totals.get(r.memberId) ?? { memberId: r.memberId, name: r.name, net: 0 };
        t.net += r.net;
        totals.set(r.memberId, t);
      }
    }
    return {
      round: inRound.length, of: inRound[0]!.roster.length,
      games: inRound.map(g => ({ gameId: g._id, number: g.number })),
      totals: [...totals.values()].sort((a, b) => b.net - a.net),
    };
  },
});
