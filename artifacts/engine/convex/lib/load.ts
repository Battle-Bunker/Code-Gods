/** Loaders that gather what a projection needs (bounded reads). */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { observation } from "./projection";
import { membersOf, recentChat } from "./rooms";

/** Batches scanned for the observation's recent own transformations. */
const RECENT_BATCHES = 64;

export async function currentGame(ctx: QueryCtx, room: Doc<"rooms">) {
  return room.currentGameId ? await ctx.db.get(room.currentGameId) : null;
}
export async function deityOf(ctx: QueryCtx, gameId: Id<"games">, godId: string) {
  return ctx.db.query("deities").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", godId)).unique();
}
export async function objectsOf(ctx: QueryCtx, gameId: Id<"games">) {
  return ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
}

/** The v3 observation of `godId` in this room (a seated god sees its own projection; others spectate). */
export async function buildObservation(ctx: QueryCtx, room: Doc<"rooms">, godId: string) {
  const members = await membersOf(ctx, room._id);
  const member = members.find(m => m.godId === godId);
  if (!member) return null;
  const game = await currentGame(ctx, room);
  const deity = game ? await deityOf(ctx, game._id, godId) : null;
  const [objects, agents, chat] = await Promise.all([
    game && deity ? objectsOf(ctx, game._id) : Promise.resolve([]),
    game && deity ? ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", game._id).eq("ownerId", godId)).take(200) : Promise.resolve([]),
    recentChat(ctx, room._id),
  ]);
  const transformations: { id: string; agentId: string; before: number | string; after: number | string; calls?: unknown; cost?: number }[] = [];
  if (game && deity) {
    const batches = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", game._id)).order("desc").take(RECENT_BATCHES);
    for (const batch of batches.reverse()) {
      batch.events.forEach((e, i) => {
        if (e.t === "transform" && e.ownerId === godId) {
          transformations.push({ id: `${batch.seq}:${i}`, agentId: e.agentId, before: e.before, after: e.value, calls: e.calls, cost: e.cost.total });
        }
      });
    }
  }
  return observation({
    room, game, deity, objects, agents, chat, transformations: transformations.slice(-500),
    self: { godId, name: member.name, kind: member.kind, ready: member.ready },
  });
}
