/**
 * Idle parking (v1's rule, restored; archive/engine-v1 convex/activity.ts and the product memory: "Park after 30
 * minutes without human activity", the owner's affordability reason). The engine is active for 30 minutes after
 * authenticated human activity: an explicit `account.touch` (the app calls it on real interaction, at most about once a
 * minute), creating or joining a room, and the owner's start, rematch or resume. AI turns, the assistant's autopilot,
 * subscriptions and heartbeats never count. When idle, a live game's next commit parks it (paused, `parked`: no ticks,
 * no AI turns, no autopilot); the next human activity resumes every parked game.
 */
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resumeGame } from "./loop";

export const IDLE_MS = 30 * 60_000;
/** Activity is written at most this often (unless a parked game needs waking). */
const TOUCH_EVERY_MS = 60_000;
// By reference: importing the assistant here would load it into every module that imports the loop.
const RESTART_AUTOPILOTS = makeFunctionReference<"mutation", { roomId: Id<"v2Rooms"> }>("v2/assistantCore:restartAutopilotsIn");
const AI_TURN = makeFunctionReference<"action", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; n: number }>("v2/aiTurn:turn");

/** When a human last acted (0: never, so a fresh deployment starts idle). */
export async function lastHumanActivity(ctx: QueryCtx): Promise<number> {
  return (await ctx.db.query("v2Activity").withIndex("by_key", q => q.eq("key", "global")).unique())?.lastHumanActivityAt ?? 0;
}
export const isIdle = (last: number, now = Date.now()) => now - last >= IDLE_MS;

/** Records human activity (at most once a minute), then resumes every idle-parked game. */
export async function touchActivity(ctx: MutationCtx): Promise<{ resumed: number }> {
  const now = Date.now();
  const doc = await ctx.db.query("v2Activity").withIndex("by_key", q => q.eq("key", "global")).unique();
  const parked = await ctx.db.query("v2Games").withIndex("by_parked", q => q.eq("parked", true)).take(200);
  if (doc && now - doc.lastHumanActivityAt < TOUCH_EVERY_MS && parked.length === 0) return { resumed: 0 };
  if (doc) await ctx.db.patch(doc._id, { lastHumanActivityAt: now });
  else await ctx.db.insert("v2Activity", { key: "global", lastHumanActivityAt: now });
  for (const game of parked) {
    await ctx.db.patch(game._id, { parked: undefined });
    await resumeGame(ctx, { ...game, parked: undefined });
    // What parking stopped starts again: the AI seats' turns and the assistants' autopilot.
    for (const s of game.roster) if (s.kind === "ai") await ctx.scheduler.runAfter(1000, AI_TURN, { gameId: game._id, memberId: s.memberId, n: 0 });
    await ctx.scheduler.runAfter(0, RESTART_AUTOPILOTS, { roomId: game.roomId });
  }
  return { resumed: parked.length };
}

/** Whether a live game should park now (nobody has acted for IDLE_MS). */
export async function shouldPark(ctx: QueryCtx, game: Doc<"v2Games">): Promise<boolean> {
  return game.phase === "live" && isIdle(await lastHumanActivity(ctx));
}
