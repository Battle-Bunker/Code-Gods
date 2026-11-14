/**
 * Who is calling, in v2 terms: the signed-in human (shared auth, convex/auth/access.ts), their membership of a v2 room,
 * their seat in a v2 game, and the affordance context the server derives from its own records (never the client's say).
 * Every v2 query and operation goes through here; sign-in is required everywhere (owner decision 2026-11-02).
 */
import { ConvexError } from "convex/values";
import type { AffordanceContext, Context, Grant } from "@workspace/v2-affordances";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { settleOwn } from "@workspace/v2-economy";
import { getViewer } from "../auth/access";
import { isAdminUser } from "../auth/identity";
import { presetOf } from "./presets";

export type V2Code = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST";
export function fail(code: V2Code, message: string): never {
  throw new ConvexError({ code, message });
}

/** A room holds at most this many members, seats and spectators together (a bounded read, R3). */
export const MAX_MEMBERS = 16;

/** The human calling: a browser session or an account grant. Room credentials of v1 rooms are not v2 callers. */
export interface User { userId: string; name: string; admin: boolean }

export async function currentUser(ctx: QueryCtx): Promise<User | null> {
  const viewer = await getViewer(ctx);
  if (!viewer || viewer.scope === "player") return null;
  return { userId: viewer.subject, name: viewer.name, admin: viewer.isAdmin };
}
export async function requireUser(ctx: QueryCtx): Promise<User> {
  return (await currentUser(ctx)) ?? fail("UNAUTHENTICATED", "Please sign in");
}
/** The human a delegate (assistant, MCP, CLI) acts for, from the users table. */
export async function userById(ctx: QueryCtx, userId: string): Promise<User | null> {
  const user = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", userId)).unique();
  return user ? { userId: user.subject, name: user.name, admin: isAdminUser(user, process.env) } : null;
}

/** A room code as people type it: any case, spaces and dashes ignored. */
export const normaliseCode = (code: string) => code.toUpperCase().replace(/[-\s]/g, "");

export async function roomById(ctx: QueryCtx, roomId: string): Promise<Doc<"v2Rooms"> | null> {
  const id = ctx.db.normalizeId("v2Rooms", roomId);
  return id ? await ctx.db.get(id) : null;
}
export async function gameById(ctx: QueryCtx, gameId: string): Promise<Doc<"v2Games"> | null> {
  const id = ctx.db.normalizeId("v2Games", gameId);
  return id ? await ctx.db.get(id) : null;
}
export async function memberOf(ctx: QueryCtx, roomId: Id<"v2Rooms">, userId: string): Promise<Doc<"v2Members"> | null> {
  return await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).first();
}
export async function playerOf(ctx: QueryCtx, gameId: Id<"v2Games">, memberId: Id<"v2Members">): Promise<Doc<"v2Players"> | null> {
  return await ctx.db.query("v2Players").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
}

/** A member of the room, or a refusal. */
export async function requireMember(ctx: QueryCtx, roomId: string) {
  const user = await requireUser(ctx);
  const room = await roomById(ctx, roomId) ?? fail("NOT_FOUND", "No such room");
  const member = await memberOf(ctx, room._id, user.userId) ?? fail("FORBIDDEN", "Join the room first");
  return { user, room, member };
}
/** A member of the game's room (players and spectators). */
export async function requireGameMember(ctx: QueryCtx, gameId: string) {
  const user = await requireUser(ctx);
  const game = await gameById(ctx, gameId) ?? fail("NOT_FOUND", "No such game");
  const member = await memberOf(ctx, game.roomId, user.userId) ?? fail("FORBIDDEN", "Join the room first");
  return { user, game, member };
}
/** The member's dealt rule in a game: cold, so a seat check never makes a query depend on what a tick writes. */
export async function ruleOf(ctx: QueryCtx, gameId: Id<"v2Games">, memberId: Id<"v2Members">): Promise<Doc<"v2Rules"> | null> {
  return await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
}
/** A player seated in the game (dealt a rule). */
export async function requireSeat(ctx: QueryCtx, gameId: string) {
  const { user, game, member } = await requireGameMember(ctx, gameId);
  const rule = await ruleOf(ctx, game._id, member._id) ?? fail("FORBIDDEN", "Only players with a seat in this game can see this");
  return { user, game, member, rule };
}
/** The own store's balance now: accrued to the game's world time (the stored balance is as of its last write). */
export async function ownEnergyNow(ctx: QueryCtx, game: Doc<"v2Games">, player: Doc<"v2Players">): Promise<number> {
  if (game.phase === "planning") return player.energy;
  const clock = await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  const world = Math.max(player.settledAt, clock?.worldSeconds ?? 0);
  return settleOwn({ balance: player.energy, settledWorldSeconds: player.settledAt }, world,
    { powerPerSecond: player.power, allocated: player.allocated, fullChargeSeconds: game.settings.economy.fullChargeSeconds }).balance;
}

/** The scope a call names: the room or game in view (app) or bound (a credential). */
export interface Scope { roomId?: string; gameId?: string; replay?: boolean }
export interface Resolved {
  ctx: AffordanceContext;
  user: User | null;
  room: Doc<"v2Rooms"> | null;
  game: Doc<"v2Games"> | null;
  member: Doc<"v2Members"> | null;
  player: Doc<"v2Players"> | null;
}

/**
 * The caller's affordance context from the server's records: the room named (or the named game's room), the game in
 * view (the one named, else the room's current one), membership, seat, ownership and the game's cold facts.
 */
export async function resolveContext(ctx: QueryCtx, user: User | null, scope: Scope, grant?: Grant): Promise<Resolved> {
  let game = scope.gameId ? await gameById(ctx, scope.gameId) : null;
  let room = game ? await ctx.db.get(game.roomId) : scope.roomId ? await roomById(ctx, scope.roomId) : null;
  // A game outside the named room (a credential bound to one room naming another's game) is not in view.
  if (game && scope.roomId && room && scope.roomId !== room._id) {
    game = null;
    room = await roomById(ctx, scope.roomId);
  }
  if (!game && room?.gameId) game = await ctx.db.get(room.gameId);
  const member = user && room ? await memberOf(ctx, room._id, user.userId) : null;
  const player = game && member ? await playerOf(ctx, game._id, member._id) : null;
  const context: Context = !user ? "signedOut" : !room ? "home" : scope.replay ? "replay" : game ? game.phase : "room";
  const out: AffordanceContext = {
    context,
    principal: {
      // In the room before a game (the bid phase), a player's seat for the next game.
      signedIn: !!user, member: !!member, seated: game ? !!player : !!member && !member.spectator, owner: !!user && !!room && room.ownerId === user.userId,
      admin: !!user?.admin,
    },
    ...(grant ? { grant } : {}),
  };
  if (room) {
    const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
    out.room = { players: members.filter(m => !m.spectator).length, minPlayers: presetOf(room.preset).minPlayers, bidOpen: !!room.bidding };
  }
  if (game && player) out.game = { phase: game.phase, energy: await ownEnergyNow(ctx, game, player), pauseUsed: player.pauseUsed, agents: player.agents };
  else if (game) out.game = { phase: game.phase };
  return { ctx: out, user, room, game, member, player };
}
