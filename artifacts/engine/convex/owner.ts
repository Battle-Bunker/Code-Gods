"use node";
/**
 * Owner actions that need the calibration tables or the sandbox (Node): settings (validated with
 * validateSettings + the offered instantiations, optimistic on the room revision) and the game start (deal
 * utility functions with the selector, spawn and score the starting objects). Each reads a context with the
 * owner check, computes, then commits through an internal mutation that re-checks everything.
 *
 * `owner.command` is the room assistant's `room-command`: one entry point for settings, start, resume,
 * endGame, addAi, removeAi (browser owner, or an `owner` credential of the room's current owner).
 */
import { v } from "convex/values";
import { lifetimeSeconds, poissonIntervalSeconds, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { assertOffered, catalogFor, deal, nextSettings, openUniform, scoresOf, seasonCommitment, uniqueSpawn, utilityCard } from "./engine/node";
import { languageAvailable } from "./engine/runtime";
import { fail } from "./lib/errors";
import { salienceOf } from "./lib/world";
import { MAX_GODS } from "./rooms";

export const fillCatalog = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }): Promise<void> => {
    const room = await ctx.runQuery(internal.game.queries.roomForEngine, { roomId });
    if (!room) return;
    await ctx.runMutation(internal.game.lobby.setCatalog, { roomId, revision: room.revision, catalog: catalogFor(room.settings as GameSettings) });
  },
});

async function updateSettings(ctx: ActionCtx, args: { roomId: string; revision: number; settings?: Record<string, unknown>; preset?: string; aiBudget?: number }): Promise<{ revision: number }> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId });
  if (context.activeGame) fail("CONFLICT", "Settings and seats are frozen during games");
  if (args.revision !== context.room.revision) fail("CONFLICT", "Settings changed; refresh before saving");
  const settings = args.settings || args.preset ? nextSettings(context.room.settings as GameSettings, args) : context.room.settings as GameSettings;
  return ctx.runMutation(internal.game.lobby.commitSettings, {
    roomId: context.room._id, revision: args.revision, settings, catalog: catalogFor(settings), aiBudget: args.aiBudget,
  });
}

/** Edit the next game's settings (explicit settings, retuned to their instantiation, or a preset) and/or the AI budget. */
export const settings = action({
  args: { roomId: v.string(), revision: v.number(), settings: v.optional(v.any()), preset: v.optional(v.string()), aiBudget: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ revision: number }> => updateSettings(ctx, args),
});

/** AI seats can play only with a configured provider key, or the mock provider in development. */
export function aiProviderAvailable(provider: string) {
  if (process.env.CODE_GODS_AI_MOCK === "1") return true;
  return !!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
}

type Started = { gameId: Id<"games">; shortCode: string; guid: string };
async function startGame(ctx: ActionCtx, args: { roomId: string; requestId?: string }): Promise<Started> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId });
  const room = context.room;
  if (args.requestId) {
    const prior = await ctx.runQuery(internal.game.lobby.receiptFor, { roomId: room._id, actorId: context.ownerId, requestId: `start:${args.requestId}` });
    if (prior) return prior.result as { gameId: Id<"games">; shortCode: string; guid: string };
  }
  if (context.activeGame) fail("CONFLICT", "There is already a live game");
  const members = context.members;
  if (members.length < 3) fail("BAD_REQUEST", "At least three gods are required");
  if (members.length > MAX_GODS) fail("BAD_REQUEST", "At most eight gods can play");
  const bots = members.filter(m => m.kind === "ai");
  for (const bot of bots) {
    if (!bot.aiAgent) fail("BAD_REQUEST", "Every AI seat needs an agent from the library");
    if (!aiProviderAvailable(bot.aiAgent.provider)) fail("UNAVAILABLE", `AI players require a server-side ${bot.aiAgent.provider} API key`);
  }
  if (bots.length && room.aiBudget <= 0) fail("BAD_REQUEST", "Approve an AI token budget before starting with AI seats");
  const settings = room.settings as GameSettings;
  try { validateSettings(settings); } catch (error) { fail("BAD_REQUEST", (error as Error).message); }
  assertOffered(settings);
  if (!await languageAvailable(settings)) fail("UNAVAILABLE", "The selected isolated runtime is unavailable");
  const dealt = deal(settings, members.length);
  const deals = members.map((m, i) => ({ godId: m.godId, utility: dealt[i] }));
  const occupied = new Set<ObjectValue>();
  const objects = [];
  for (let i = 0; i < settings.startingObjectCount; i++) {
    const value = uniqueSpawn(settings, occupied);
    if (value === undefined) break; // only a nearly full tiny domain gets here
    occupied.add(value);
    const scores = scoresOf(settings, deals, value);
    objects.push({ value: value as number | string, scores, salience: salienceOf(scores) });
  }
  const next = poissonIntervalSeconds(settings.spawnRateHz, openUniform());
  return ctx.runMutation(internal.game.lobby.commitStart, {
    roomId: room._id, revision: room.revision, memberIds: members.map(m => m.godId), requestId: args.requestId,
    seasonCommitment: seasonCommitment(), endAtWorld: lifetimeSeconds(settings.halfLifeSeconds, openUniform()),
    nextSpawn: Number.isFinite(next) ? next : Number.MAX_VALUE, catalog: catalogFor(settings),
    deities: deals.map(d => ({ godId: d.godId, utility: d.utility, card: utilityCard(settings, d.utility) })),
    objects,
  });
}

/** Launch the next game from the room (3–8 gods): deals utility functions, spawns the starting objects. */
export const start = action({
  args: { roomId: v.string(), requestId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Started> => startGame(ctx, args),
});

/**
 * The assistant's `room-command` (lib/player-client ownerActionSchema): one owner entry point. Never
 * replayed automatically: `start` is idempotent per requestId; the rest re-check state.
 */
export const command = action({
  args: {
    roomId: v.string(),
    action: v.union(v.literal("settings"), v.literal("start"), v.literal("resume"), v.literal("endGame"), v.literal("addAi"), v.literal("removeAi")),
    requestId: v.optional(v.string()), revision: v.optional(v.number()), settings: v.optional(v.any()), preset: v.optional(v.string()),
    aiBudget: v.optional(v.number()), aiAgentId: v.optional(v.string()), deityId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId });
    const roomId = context.room._id;
    switch (args.action) {
      case "settings":
        if (args.revision === undefined) return fail("BAD_REQUEST", "revision is required");
        return updateSettings(ctx, { roomId, revision: args.revision, settings: args.settings, preset: args.preset, aiBudget: args.aiBudget });
      case "start": return startGame(ctx, { roomId, requestId: args.requestId });
      case "resume": return ctx.runMutation(api.rooms.resume, { roomId });
      case "endGame": return ctx.runMutation(api.rooms.endActiveGame, { roomId });
      case "addAi":
        if (!args.aiAgentId) return fail("BAD_REQUEST", "Choose an agent from the library");
        return ctx.runMutation(api.rooms.addAi, { roomId, templateId: args.aiAgentId });
      case "removeAi":
        if (!args.deityId) return fail("BAD_REQUEST", "AI seat not found");
        return ctx.runMutation(api.rooms.removeAi, { roomId, godId: args.deityId });
    }
  },
});

