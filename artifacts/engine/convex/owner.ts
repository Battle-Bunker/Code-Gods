"use node";
/**
 * Owner actions that need the calibration tables or the sandbox (Node): settings (validated with
 * validateSettings + the playable instantiations, optimistic on the room revision) and the game start (deal
 * utility functions with the selector, prepare their tables, spawn and score the starting objects). Each reads a context with the
 * owner check, computes, then commits through an internal mutation that re-checks everything.
 *
 * `owner.command` is the room assistant's `room-command`: one entry point for settings, start, resume,
 * endGame, addAi, removeAi (browser owner, or an `owner` credential of the room's current owner).
 */
import { ConvexError, v } from "convex/values";
import { instantiationOf, lifetimeSeconds, poissonIntervalSeconds, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { firstUseSeconds, type InstanceTables, type UtilityDescriptor } from "@workspace/game-utilities";
import { calibrationManifest, drawsOf, resolveTables } from "./engine/calibration";
import { assertShape, catalogFor, deal, dealerOf, nextSettings, openUniform, priorOf, scoresOf, seasonCommitment, uniqueSpawn, utilityCard } from "./engine/node";
import { bindRuntime, languageAvailable } from "./engine/runtime";
import { settingsDomain } from "./engine/settingsDomain";
import { fail } from "./lib/errors";
import { principalV, type Principal } from "./lib/rooms";
import type { RoomSetupChange } from "./setups";
import { salienceOf } from "./lib/world";
import { preparingLine, preparingView } from "./lib/projection";
import { MAX_GODS } from "./rooms";
import { PREPARING_WATCHDOG_MS } from "./game/lobby";

export const fillCatalog = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }): Promise<void> => {
    await bindRuntime(ctx);
    const room = await ctx.runQuery(internal.game.queries.roomForEngine, { roomId });
    if (!room) return;
    await ctx.runMutation(internal.game.lobby.setCatalog, { roomId, revision: room.revision, catalog: catalogFor(room.settings as GameSettings) });
  },
});

type SettingsArgs = { roomId: string; revision: number; settings?: Record<string, unknown>; setupId?: string; aiBudget?: number; principal?: Principal };
type SettingsResult = { revision: number; setup?: RoomSetupChange };
async function updateSettings(ctx: ActionCtx, args: SettingsArgs): Promise<SettingsResult> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal: args.principal });
  if (context.activeGame) fail("CONFLICT", "Settings and seats are frozen during games");
  if (args.revision !== context.room.revision) fail("CONFLICT", "Settings changed; refresh before saving");
  if (args.settings && args.setupId) fail("BAD_REQUEST", "Send settings or a setupId, not both");
  const previous = context.room.settings as GameSettings;
  const commit = (settings: GameSettings, setup?: { kind: "apply"; setupId: Id<"gameSetups"> } | { kind: "edit"; baseUpdatedAt?: number }): Promise<SettingsResult> =>
    ctx.runMutation(internal.game.lobby.commitSettings, {
      roomId: context.room._id, principal: args.principal, revision: args.revision, settings, catalog: catalogFor(settings), aiBudget: args.aiBudget,
      ...(setup ? { setup } : {}),
    });
  if (args.setupId) {
    const setup: { id: Id<"gameSetups">; settings: GameSettings } = await ctx.runQuery(internal.setups.resolve, { setupId: args.setupId });
    return commit(nextSettings(await calibrationManifest(ctx), previous, { setup: setup.settings }), { kind: "apply", setupId: setup.id });
  }
  if (args.settings) {
    // The owner's own setup is changed as it is now (it may have been saved since the room took its snapshot).
    const owned: { settings: GameSettings; updatedAt: number } | null =
      await ctx.runQuery(internal.setups.ownedBase, { setupId: context.room.setupId, ownerId: context.ownerId });
    return commit(nextSettings(await calibrationManifest(ctx), owned?.settings ?? previous, { settings: args.settings }), { kind: "edit", ...(owned ? { baseUpdatedAt: owned.updatedAt } : {}) });
  }
  return commit(previous);
}

/**
 * Edit the next game's settings and/or the AI budget. The room always runs a game setup: `setupId` applies one (any
 * setup: they are shared), its complete settings becoming the room's; `settings` changes some fields through the
 * settings model (game-core settings-model.ts: only the game's own dependencies move) and writes the result to the
 * room's setup when the owner owns it, else to a new setup of theirs named "<name>'s copy" that the room then runs.
 * The result's `setup` says which, with a one-sentence `note`.
 */
export const settings = action({
  args: { roomId: v.string(), revision: v.number(), settings: v.optional(v.any()), setupId: v.optional(v.string()), aiBudget: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SettingsResult> => { await bindRuntime(ctx); return updateSettings(ctx, args); },
});

/** AI seats can play only with a configured provider key, or the mock provider in development. */
export function aiProviderAvailable(provider: string) {
  if (process.env.AI_MOCK === "1") return true;
  return !!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
}

type Started = { gameId: Id<"games">; shortCode: string; guid: string };
/** A start waiting for calibration tables computed on demand (rooms.preparing; the game begins by itself). */
export type Preparing = { status: "preparing"; instance: string; ready: number; total: number; estimateSeconds: number; dealtAs: string; note?: string; message: string };
type StartResult = Started | Preparing;
type Deal = { godId: string; utility: UtilityDescriptor };

/** How long a preparation may run before it is reported failed (a table computing for longer is a stuck backend). */
export const MAX_PREPARING_MS = 30 * 60_000;

/** Spawn and score the starting objects, then commit the game (the start's last step, both halves). */
async function launch(ctx: ActionCtx, settings: GameSettings, deals: readonly Deal[], tables: InstanceTables,
  commit: { roomId: Id<"rooms">; revision: number; memberIds: string[]; requestId?: string; principal?: Principal; prepared?: string }): Promise<Started | null> {
  const occupied = new Set<ObjectValue>();
  const objects = [];
  for (let i = 0; i < settings.startingObjectCount; i++) {
    const value = uniqueSpawn(settings, occupied);
    if (value === undefined) break; // only a nearly full tiny domain gets here
    occupied.add(value);
    const scores = scoresOf(tables, settings, deals, value);
    objects.push({ value: value as number | string, scores, salience: salienceOf(scores) });
  }
  const next = poissonIntervalSeconds(settings.spawnRateHz, openUniform());
  return ctx.runMutation(internal.game.lobby.commitStart, {
    ...commit,
    seasonCommitment: seasonCommitment(), endAtWorld: lifetimeSeconds(settings.halfLifeSeconds, openUniform()),
    nextSpawn: Number.isFinite(next) ? next : Number.MAX_VALUE, catalog: catalogFor(settings),
    deities: deals.map(d => ({ godId: d.godId, utility: d.utility, card: utilityCard(settings, d.utility) })),
    objects,
  });
}

function preparingResult(p: NonNullable<Doc<"rooms">["preparing"]>): Preparing {
  const view = preparingView(p);
  return { status: "preparing", instance: p.instance, ready: view.ready, total: p.total, estimateSeconds: p.estimateSeconds,
    dealtAs: p.dealer.dealtAs, ...(p.dealer.note ? { note: p.dealer.note } : {}), message: preparingLine(view) };
}

/**
 * The game start (docs/analytic-calibration/architecture.md §3.4). The deal is fixed first, from every available
 * family; then each draw's table is resolved (analytic, shipped, or computed earlier: the common case, and the game
 * starts at once). Missing tables are claimed and computed by a fan-out of Node actions, one per table; the room
 * records the deal and its progress (`preparing`) and the call returns `{ status: "preparing" }`. When the last table
 * lands, calibration/cache.ts finished schedules `completeStart`, which launches the game with that deal: the planning
 * clock starts then. Idempotent per requestId (a repeated start reports the preparation, then the game).
 */
async function startGame(ctx: ActionCtx, args: { roomId: string; requestId?: string; principal?: Principal }): Promise<StartResult> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal: args.principal });
  const room = context.room;
  if (args.requestId) {
    const prior = await ctx.runQuery(internal.game.lobby.receiptFor, { roomId: room._id, actorId: context.ownerId, requestId: `start:${args.requestId}` });
    if (prior) return prior.result as Started;
  }
  if (context.activeGame) fail("CONFLICT", "There is already a live game");
  // A preparation in progress is reported, not restarted; a failed one may be started afresh.
  if (room.preparing && !room.preparing.error) return preparingResult(room.preparing);
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
  const manifest = await calibrationManifest(ctx);
  try { validateSettings(settings, settingsDomain()); } catch (error) { fail("BAD_REQUEST", (error as Error).message); }
  assertShape(manifest, settings);
  if (!await languageAvailable(settings)) fail("UNAVAILABLE", "The selected isolated runtime is unavailable");
  const inst = instantiationOf(settings);
  const dealt = deal(settings, members.length);
  const deals = members.map((m, i) => ({ godId: m.godId, utility: dealt[i] }));
  let resolved;
  try { resolved = await resolveTables(ctx, inst, drawsOf(dealt), priorOf(settings.priorId), { owner: { id: context.ownerId, roomId: room._id } }); } catch (error) {
    // The rate limit's words reach the owner as they are; anything else is the tables failing.
    if (error instanceof ConvexError && (error.data as { code?: string })?.code === "RATE_LIMITED") throw error;
    return fail("UNAVAILABLE", `The rule tables for this game could not be prepared: ${(error as Error).message}`);
  }
  const commit = { roomId: room._id, revision: room.revision, memberIds: members.map(m => m.godId), requestId: args.requestId, principal: args.principal };
  if (!resolved.pending.length) return (await launch(ctx, settings, deals, resolved.tables, commit))!;
  const keys = [...new Set(resolved.pending.map(p => p.key))];
  const total = new Set([...resolved.ready.map(r => r.key), ...keys]).size;
  const preparing = await ctx.runMutation(internal.game.lobby.beginPreparing, {
    ...commit, requestId: args.requestId ?? crypto.randomUUID(), instance: inst.key, total, pending: keys,
    estimateSeconds: firstUseSeconds(inst), deals, dealer: dealerOf(settings),
  });
  return preparingResult(preparing);
}

/**
 * The start's second half: the tables of the preparing room's deal are all ready (or, as the watchdog, check whether
 * they are: a computation that crashed is restarted by its claim, and one past MAX_PREPARING_MS is reported). Launches
 * the game with the recorded deal, or records why it cannot.
 */
export const completeStart = internalAction({
  args: { roomId: v.id("rooms"), requestId: v.string(), watchdog: v.optional(v.boolean()) },
  handler: async (ctx, { roomId, requestId, watchdog }): Promise<void> => {
    await bindRuntime(ctx);
    const room = await ctx.runQuery(internal.game.queries.roomForEngine, { roomId });
    const p = room?.preparing;
    if (!room || !p || p.requestId !== requestId || p.error) return;
    const settings = room.settings as GameSettings;
    const failWith = (message: string) => ctx.runMutation(internal.game.lobby.preparingFailed, { roomId, requestId, message });
    let resolved;
    try {
      resolved = await resolveTables(ctx, instantiationOf(settings), drawsOf(p.deals.map(d => d.utility as UtilityDescriptor)), priorOf(settings.priorId));
    } catch (error) { return void await failWith(`The rule tables for this game could not be prepared: ${(error as Error).message}. Start again to retry.`); }
    if (resolved.pending.length) {
      if (Date.now() - p.startedAt > MAX_PREPARING_MS) {
        return void await failWith(`Preparing the rule tables took longer than ${MAX_PREPARING_MS / 60_000} minutes (${resolved.pending.length} of ${p.total} still computing). Start again to retry.`);
      }
      if (watchdog) await ctx.scheduler.runAfter(PREPARING_WATCHDOG_MS, internal.owner.completeStart, { roomId, requestId, watchdog: true });
      return;
    }
    try {
      await launch(ctx, settings, p.deals as Deal[], resolved.tables, { roomId, revision: p.revision, memberIds: p.memberIds, requestId, prepared: requestId });
    } catch (error) {
      await failWith(`The game could not start: ${(error as Error).message}`);
    }
  },
});

/**
 * Launch the next game from the room (3–8 gods): deals utility functions, spawns the starting objects. On a shape whose
 * tables are not all ready yet, returns `{ status: "preparing", ready, total, … }` and the game begins by itself once
 * they are (the room's `preparing` shows the progress).
 */
export const start = action({
  args: { roomId: v.string(), requestId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<StartResult> => { await bindRuntime(ctx); return startGame(ctx, args); },
});

const commandArgs = {
  roomId: v.string(),
  action: v.union(v.literal("settings"), v.literal("start"), v.literal("resume"), v.literal("endGame"), v.literal("addAi"), v.literal("removeAi")),
  requestId: v.optional(v.string()), revision: v.optional(v.number()), settings: v.optional(v.any()), setupId: v.optional(v.string()),
  aiBudget: v.optional(v.number()), aiAgentId: v.optional(v.string()), deityId: v.optional(v.string()),
};
type CommandArgs = { roomId: string; action: "settings" | "start" | "resume" | "endGame" | "addAi" | "removeAi"; requestId?: string; revision?: number;
  settings?: Record<string, unknown>; setupId?: string; aiBudget?: number; aiAgentId?: string; deityId?: string };

/** One owner action as the authenticated caller, or as the human behind `principal` (the agent registry's owner tools). */
async function ownerCommand(ctx: ActionCtx, args: CommandArgs, principal?: Principal): Promise<unknown> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal });
  const roomId = context.room._id;
  switch (args.action) {
    case "settings":
      if (args.revision === undefined) return fail("BAD_REQUEST", "revision is required");
      return updateSettings(ctx, { roomId, revision: args.revision, settings: args.settings, setupId: args.setupId, aiBudget: args.aiBudget, principal });
    case "start": return startGame(ctx, { roomId, requestId: args.requestId, principal });
    case "resume": return principal ? ctx.runMutation(internal.rooms.resumeAs, { principal, roomId }) : ctx.runMutation(api.rooms.resume, { roomId });
    case "endGame": return principal ? ctx.runMutation(internal.rooms.endActiveGameAs, { principal, roomId }) : ctx.runMutation(api.rooms.endActiveGame, { roomId });
    case "addAi":
      if (!args.aiAgentId) return fail("BAD_REQUEST", "Choose an agent from the library");
      return principal ? ctx.runMutation(internal.rooms.addAiAs, { principal, roomId, templateId: args.aiAgentId })
        : ctx.runMutation(api.rooms.addAi, { roomId, templateId: args.aiAgentId });
    case "removeAi":
      if (!args.deityId) return fail("BAD_REQUEST", "AI seat not found");
      return principal ? ctx.runMutation(internal.rooms.removeAiAs, { principal, roomId, godId: args.deityId })
        : ctx.runMutation(api.rooms.removeAi, { roomId, godId: args.deityId });
  }
}

/**
 * The assistant's `room-command` (lib/player-client ownerActionSchema): one owner entry point. Never
 * replayed automatically: `start` is idempotent per requestId; the rest re-check state.
 */
export const command = action({
  args: commandArgs,
  handler: async (ctx, args): Promise<unknown> => { await bindRuntime(ctx); return ownerCommand(ctx, args); },
});
/** Internal twin of `command` for a principal {credentialId} (the agent registry's owner tools). */
export const commandAs = internalAction({
  args: { principal: principalV, ...commandArgs },
  handler: async (ctx, { principal, ...args }): Promise<unknown> => { await bindRuntime(ctx); return ownerCommand(ctx, args, principal); },
});
