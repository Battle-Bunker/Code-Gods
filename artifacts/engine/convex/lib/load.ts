/** Loaders that gather what a projection needs (bounded reads). */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { allowedLanguages, type GameSettings } from "@workspace/game-core";
import { sandboxViews } from "../runtime/readiness";
import { observation, type ObservationInput } from "./projection";
import { membersOf, recentChat } from "./rooms";
import { withClock } from "../game/state";

/**
 * The observation's recent own transformations: those in the game's latest 16 batches (ticks; about the last 16 s), at
 * most 500. Older history is in player.events / player.history.
 */
const RECENT_BATCHES = 16, RECENT_TRANSFORMATIONS = 500;

type Transformation = { id: string; agentId: string; before: number | string; after: number | string; calls?: unknown; cost?: number };

/**
 * `godId`'s transformations in the latest RECENT_BATCHES batches, oldest first, id `<seq>:<position in the batch>`.
 * Read from the god's own objectEvents rows (by_game_owner_seq) plus the latest batch for the window, not from every
 * batch of the window (each holds every god's events). A game whose rows predate `index`/`cost` (or objectEvents, log
 * schema < 3) reads the batches as before.
 */
async function recentOwnTransformations(ctx: QueryCtx, gameId: Id<"games">, godId: string, max = RECENT_TRANSFORMATIONS): Promise<Transformation[]> {
  const latest = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").first();
  if (!latest) return [];
  if ((latest.schema ?? 1) >= 3) {
    const rows = await ctx.db.query("objectEvents")
      .withIndex("by_game_owner_seq", q => q.eq("gameId", gameId).eq("ownerId", godId).gt("seq", latest.seq - RECENT_BATCHES))
      .order("desc").take(max);
    if (rows.every(r => r.index !== undefined && r.cost !== undefined)) {
      return rows.reverse().map(r => ({ id: `${r.seq}:${r.index}`, agentId: r.agentId!, before: r.before!, after: r.value, calls: r.calls, cost: r.cost }));
    }
  }
  const batches = await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").take(RECENT_BATCHES);
  const out: Transformation[] = [];
  for (const batch of batches.reverse()) {
    batch.events.forEach((e, i) => {
      if (e.t === "transform" && e.ownerId === godId) out.push({ id: `${batch.seq}:${i}`, agentId: e.agentId, before: e.before, after: e.value, calls: e.calls, cost: e.cost.total });
    });
  }
  return out.slice(-max);
}

export async function currentGame(ctx: QueryCtx, room: Doc<"rooms">) {
  return room.currentGameId ? await ctx.db.get(room.currentGameId) : null;
}
export async function deityOf(ctx: QueryCtx, gameId: Id<"games">, godId: string) {
  return ctx.db.query("deities").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", godId)).unique();
}
/**
 * The seq of a game's latest tickBatches doc (-1 before any): an event cursor's end. The loop's batch counter lives in
 * gameEngine, which public queries never read (game/state.ts).
 */
export async function latestBatchSeq(ctx: QueryCtx, gameId: Id<"games">) {
  return (await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").first())?.seq ?? -1;
}
export async function objectsOf(ctx: QueryCtx, gameId: Id<"games">) {
  return ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
}

/**
 * What a narrow observation reads instead of the world (player.observationFor with `objectsLimit`): one page of the
 * god's objectViews rows and its godTotals score, and caps on its agents, chat and recent transformations. The
 * leaderboard is the published scoreboard (on the clock), as in the full observation.
 */
export type NarrowObjects = {
  objects: (game: { _id: Id<"games"> }) => Promise<{ views: NonNullable<ObservationInput["views"]>; score: number }>;
  agents: number; chat: number; transformations: number;
};

/**
 * The v3 observation of `godId` in this room (a seated god sees its own projection; others spectate). With `narrow`,
 * no object document is read: the objects, score and caps come from `narrow` (docs/convex-read-architecture.md §4.5).
 */
export async function buildObservation(ctx: QueryCtx, room: Doc<"rooms">, godId: string, narrow?: NarrowObjects) {
  const members = await membersOf(ctx, room._id);
  const member = members.find(m => m.godId === godId);
  if (!member) return null;
  const header = await currentGame(ctx, room);
  const game = header && await withClock(ctx, header);
  const deity = game ? await deityOf(ctx, game._id, godId) : null;
  const seated = game && deity ? game : null;
  const [objects, read, agents, chat] = await Promise.all([
    seated && !narrow ? objectsOf(ctx, seated._id) : Promise.resolve([]),
    seated && narrow ? narrow.objects(seated) : Promise.resolve(undefined),
    seated ? ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", seated._id).eq("ownerId", godId)).take(narrow?.agents ?? 200) : Promise.resolve([]),
    recentChat(ctx, room._id, narrow?.chat),
  ]);
  const transformations = seated ? await recentOwnTransformations(ctx, seated._id, godId, narrow?.transformations) : [];
  const sandboxes = await sandboxViews(ctx, allowedLanguages((game?.settings ?? room.settings) as GameSettings));
  return observation({
    room, game, deity, sandboxes, objects, agents, chat, transformations,
    ...(read ? { views: read.views, score: read.score } : {}),
    self: { godId, name: member.name, kind: member.kind, ready: member.ready },
  });
}
