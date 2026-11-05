/**
 * Autopilot (assistant/mode.ts): the assistant plays for its player without being prompted. A chain of scheduled ticks
 * per (room, human), like an AI seat's turn chain (ai/seats.ts), with a generation (`assistantPrefs.autopilotChain`) so
 * a stale tick exits. It starts when the player chooses Autopilot (assistant.setMode) and whenever a game of the room
 * starts or resumes (ai/seats.ts startAll schedules startRoom). Each tick, while the room's game is in planning or
 * running, opens one turn in the player's latest conversation of the game (or a new one), with the engine's prompt as
 * its message (shown as "(autopilot)"), at the game's start and then every LIMITS.autopilotMs, of at most
 * LIMITS.autopilotSteps steps. It never opens one while a turn of the player's runs or a message of theirs waits, and a
 * player's message preempts an autopilot turn (assistant.send): the player always comes first.
 *
 * The chain stops (no further tick) when the mode is no longer autopilot, the game ends or is parked (recovery: idle
 * parking, a failure; a resume restarts it), the engine is idle, AI is not available in the room or its assistant quota
 * is 0, or the player's allowance for the game is down to its last AUTOPILOT_RESERVE (kept for their own questions).
 * Its turns draw on the same per-game assistant quota as the player's own (ai/seats.ts reserve, pool "assistant").
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { allowanceOf, assistantEpoch } from "../ai/seats";
import { aiEnabledFor, assistantQuotaOf } from "../lib/aiAccess";
import { isIdle, lastHumanActivity } from "../lib/rooms";
import { LIMITS, isActive } from "./limits";
import { activeAssistantCredentials, latestTurnOf, log, openTurn } from "./turns";

/** The share of the player's per-game allowance autopilot leaves for the player's own questions. */
export const AUTOPILOT_RESERVE = 0.1;
/** The engine's prompt opening each autopilot turn (the model reads it as the engine's, never the player's). */
export const AUTOPILOT_PROMPT = "(autopilot) Engine prompt, not from the player: you are on Autopilot. Look at the briefing and play the player's next move for them now, as your MODE says. If nothing is worth doing, say so in one short line.";
const THREAD_TITLE = "Autopilot";

type Prefs = Doc<"assistantPrefs">;

/** Start (or restart) a player's chain: a new generation, its first tick now. */
export async function startAutopilot(ctx: MutationCtx, prefs: Prefs, delayMs = 0) {
  const chain = (prefs.autopilotChain ?? 0) + 1;
  await ctx.db.patch(prefs._id, { autopilotChain: chain });
  await ctx.scheduler.runAfter(delayMs, internal.assistant.autopilot.tick, { roomId: prefs.roomId, subject: prefs.subject, chain });
}

/** A game of the room started or resumed (ai/seats.ts startAll): restart every autopilot of the room, staggered. */
export const startRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const rows = await ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", roomId)).take(200);
    let i = 0;
    for (const prefs of rows) if (prefs.mode === "autopilot") await startAutopilot(ctx, prefs, 2000 + 1500 * i++);
  },
});

/**
 * Why the chain stops now, or null when it goes on. `wait`: it goes on but opens no turn this time (paused, a turn of
 * the player's running, a message waiting).
 */
async function tickState(ctx: MutationCtx, prefs: Prefs | null, chain: number): Promise<{ stop: string } | { wait: string } | { room: Doc<"rooms">; credentialId: Id<"credentials"> }> {
  if (!prefs || prefs.mode !== "autopilot" || prefs.autopilotChain !== chain) return { stop: "stale" };
  const room = await ctx.db.get(prefs.roomId);
  const game = room?.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  if (!room || !game || game.phase === "ended" || game.phase === "recovery") return { stop: "no game" };
  // Only a god dealt into this game plays (a spectator, or a player who left, has nothing to play).
  if (!game.roster.some(m => m.id === prefs.subject)) return { stop: "not playing" };
  if (isIdle(await lastHumanActivity(ctx))) return { stop: "idle" };
  if (!(await aiEnabledFor(ctx, room)) || assistantQuotaOf(room) <= 0) return { stop: "off" };
  const allowance = await allowanceOf(ctx, room, prefs.subject);
  if (allowance.used >= allowance.limit * (1 - AUTOPILOT_RESERVE)) return { stop: "budget" };
  if (game.phase === "paused") return { wait: "paused" };
  const latest = await latestTurnOf(ctx, room._id, prefs.subject);
  if (latest && isActive(latest.status)) return { wait: "busy" };
  // A message of the player's waiting to be answered (not one a Stop held: that waits for the player, not for us).
  const queued = await ctx.db.query("assistantQueue").withIndex("by_key_status", q => q.eq("roomId", room._id).eq("subject", prefs.subject).eq("epoch", assistantEpoch(room)).eq("status", "queued")).take(LIMITS.queued * 4);
  if (queued.some(r => !(r.held ?? false))) return { wait: "queued" };
  // The player's assistant credential for the room (assistant.setMode makes one that may act when Autopilot is chosen).
  const credential = (await activeAssistantCredentials(ctx, prefs.subject, room)).find(r => r.permission !== "read");
  if (!credential) return { stop: "no credential" };
  return { room, credentialId: credential._id };
}

/** One tick of a player's autopilot: maybe open a turn, then schedule the next tick (or stop). */
export const tick = internalMutation({
  args: { roomId: v.id("rooms"), subject: v.string(), chain: v.number() },
  handler: async (ctx, { roomId, subject, chain }) => {
    const prefs = await ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", roomId).eq("subject", subject)).unique();
    const state = await tickState(ctx, prefs, chain);
    if ("stop" in state) {
      if (state.stop !== "stale") log("autopilot.stop", { roomId, reason: state.stop });
      return { stopped: state.stop };
    }
    if ("room" in state) {
      const { room, credentialId } = state;
      const epoch = assistantEpoch(room);
      const now = Date.now();
      const latestThread = await ctx.db.query("assistantThreads").withIndex("by_room_subject_epoch", q => q.eq("roomId", room._id).eq("subject", subject).eq("epoch", epoch)).order("desc").first();
      const threadId = latestThread?._id ?? await ctx.db.insert("assistantThreads", { roomId: room._id, subject, title: THREAD_TITLE, epoch, createdAt: now, updatedAt: now });
      const turnId = await openTurn(ctx, { room, threadId, subject, credentialId, trigger: "autopilot" }, [{ text: AUTOPILOT_PROMPT, autopilot: true }]);
      log("autopilot.turn", { roomId, turnId });
    }
    await ctx.scheduler.runAfter(LIMITS.autopilotMs, internal.assistant.autopilot.tick, { roomId, subject, chain });
    return { stopped: null, opened: "room" in state };
  },
});
