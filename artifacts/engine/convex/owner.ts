"use node";
/**
 * Owner actions that need the calibration tables (Node; they never boot a sandbox: engine/runtime.ts ensureSandboxes): settings (validated with
 * validateSettings + the playable instantiations, optimistic on the room revision) and the game start (deal
 * utility functions with the selector, prepare their tables, spawn and score the starting objects). Each reads a context with the
 * owner check, computes, then commits through an internal mutation that re-checks everything.
 *
 * `owner.command` is the room assistant's `room-command`: one entry point for settings, start, resume,
 * endGame, addAi, removeAi (browser owner, or an `owner` credential of the room's current owner).
 */
import { ConvexError, v } from "convex/values";
import { LANGUAGE_SPECS, instantiationOf, gameEndSeconds, upgradeStoredSettings, poissonIntervalSeconds, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { firstUseSeconds, type InstanceTables, type UtilityDescriptor } from "@workspace/game-utilities";
import { calibrationManifest, drawsOf, resolveTables } from "./engine/calibration";
import { assertShape, catalogFor, deal, dealWithBidsFor, dealerOf, disclosureNoise, newNoiseKey, nextSettings, openUniform, pinTables, priorOf, scoresOf, seasonCommitment, uniqueSpawn, utilityCard } from "./engine/node";
import { storePinned } from "./engine/pinned";
import { ensureSandboxes } from "./engine/runtime";
import { settingsDomain } from "./engine/settingsDomain";
import { fail } from "./lib/errors";
import { AI_ADMIN_ONLY } from "./lib/aiAccess";
import { principalV, type Principal } from "./lib/rooms";
import type { RoomSetupChange } from "./setups";
import { salienceOf } from "./lib/world";
import { dealKeyOf, rotatedDeal, type PastDeal } from "./lib/dealRotation";
import { preparingLine, preparingView } from "./lib/projection";
import { MAX_GODS } from "./rooms";
import { PREPARING_WATCHDOG_MS } from "./game/lobby";
import { BIDDING_WATCHDOG_MS, biddingLine, biddingView, type AuctionRecord, type BidOutcome, type RoomBidding } from "./bidding";

export const fillCatalog = internalAction({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }): Promise<void> => {
    const room = await ctx.runQuery(internal.game.queries.roomForEngine, { roomId });
    if (!room) return;
    await ctx.runMutation(internal.game.lobby.setCatalog, { roomId, revision: room.revision, catalog: catalogFor(room.settings as GameSettings) });
  },
});

type SettingsArgs = { roomId: string; revision: number; settings?: Record<string, unknown>; setupId?: string; principal?: Principal };
type SettingsResult = { revision: number; setup?: RoomSetupChange };
async function updateSettings(ctx: ActionCtx, args: SettingsArgs): Promise<SettingsResult> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal: args.principal });
  if (context.activeGame) fail("CONFLICT", "Settings and seats are frozen during games");
  if (args.revision !== context.room.revision) fail("CONFLICT", "Settings changed; refresh before saving");
  if (args.settings && args.setupId) fail("BAD_REQUEST", "Send settings or a setupId, not both");
  // A room saved before a field existed carries stored settings without it: upgrade them (idempotent) before committing.
  const previous = (upgradeStoredSettings(context.room.settings) ?? context.room.settings) as GameSettings;
  const commit = (settings: GameSettings, setup?: { kind: "apply"; setupId: Id<"gameSetups"> } | { kind: "edit"; baseUpdatedAt?: number }): Promise<SettingsResult> =>
    ctx.runMutation(internal.game.lobby.commitSettings, {
      roomId: context.room._id, principal: args.principal, revision: args.revision, settings, catalog: catalogFor(settings),
      ...(setup ? { setup } : {}),
    });
  if (args.setupId) {
    const setup: { id: Id<"gameSetups">; settings: GameSettings } = await ctx.runQuery(internal.setups.resolve, { setupId: args.setupId, principal: args.principal });
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
 * Edit the next game's settings (the AI quotas are rooms.setAiQuotas). The room always runs a game setup: `setupId` applies one (any
 * setup: they are shared), its complete settings becoming the room's; `settings` changes some fields through the
 * settings model (game-core settings-model.ts: only the game's own dependencies move) and writes the result to the
 * room's setup when the owner owns it, else to a new setup of theirs named "<name>'s copy" that the room then runs.
 * The result's `setup` says which, with a one-sentence `note`.
 */
export const settings = action({
  args: { roomId: v.string(), revision: v.number(), settings: v.optional(v.any()), setupId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<SettingsResult> => { return updateSettings(ctx, args); },
});

/** AI seats can play only with a configured provider key, or the mock provider in development. */
export function aiProviderAvailable(provider: string) {
  if (process.env.AI_MOCK === "1" || provider === "builtin") return true;
  return !!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim();
}

type Started = { gameId: Id<"games">; shortCode: string; guid: string };
/** A start waiting for calibration tables computed on demand (rooms.preparing; the game begins by itself). */
export type Preparing = { status: "preparing"; instance: string; ready: number; total: number; estimateSeconds: number; dealtAs: string; note?: string; message: string };
/** A start in its bid phase (rooms.bidding, bidding.ts): the players bid until `endsAt`; the game is dealt and begins by itself. */
export type Bidding = { status: "bidding"; startedAt: number; endsAt: number; seconds: number; pricing: "first" | "second"; players: number; message: string };
type StartResult = Started | Preparing | Bidding;
/** `bid`: the god's outcome of the bid phase, when somebody won a bid (it goes on the god's own card, with its handicap). */
/** `rotation`: a passed-on deal's line for the card (lib/dealRotation.ts): this game's round, of how many, and who held the rule last game. */
type Rotation = { round: number; of: number; from: string };
type Deal = { godId: string; utility: UtilityDescriptor; bid?: BidOutcome; rotation?: Rotation };
/** The rotation a game belongs to (games.rotation): its round of `of`, the round's first seat order and its earlier games. */
type GameRotation = { round: number; of: number; order: string[]; gameIds: Id<"games">[] };

function biddingResult(b: RoomBidding): Bidding {
  const view = biddingView(b);
  return { status: "bidding", startedAt: view.startedAt, endsAt: view.endsAt, seconds: view.seconds, pricing: view.pricing, players: view.players, message: biddingLine(view) };
}

/** How long a preparation may run before it is reported failed (a table computing for longer is a stuck backend). */
export const MAX_PREPARING_MS = 30 * 60_000;

/**
 * The rotated deal (lib/dealRotation.ts) for a start without bids, as each god's utility and the line its card shows:
 * the last game's rules passed one seat along when the room plays again with the same players and dealing settings.
 * Null (a fresh deal) otherwise, and when a passed-on rule can no longer be dealt here (a deploy withdrew it).
 */
async function rotationFor(ctx: ActionCtx, roomId: Id<"rooms">, settings: GameSettings, godIds: readonly string[]): Promise<{ deals: { utility: UtilityDescriptor; rotation: Rotation }[] | null; game: GameRotation | null }> {
  // A game dealt with a bid phase is no part of a rotation; any other starts one (round 1) or continues it.
  if ((settings.bidSeconds ?? 0) > 0) return { deals: null, game: null };
  const fresh = { deals: null, game: { round: 1, of: godIds.length, order: [...godIds], gameIds: [] } };
  const history = await ctx.runQuery(internal.game.lobby.pastDeals, { roomId });
  const r = rotatedDeal(godIds, dealKeyOf(settings as unknown as Record<string, unknown>), history as PastDeal[]);
  if (!r) return fresh;
  const dealable = new Set(catalogFor(settings).filter(f => f.role !== "penalty" && !f.excluded).map(f => f.id));
  if (r.utilities.some(u => !dealable.has(u.familyId))) return fresh;
  const nameOf = (godId: string) => (history[0]!.names[history[0]!.godIds.indexOf(godId)] ?? godId).slice(0, 128);
  return {
    deals: r.utilities.map((utility, k) => ({ utility, rotation: { round: r.round, of: r.of, from: nameOf(r.from[k]!) } })),
    game: { round: r.round, of: r.of, order: r.order, gameIds: r.earlier.map(g => g.id as Id<"games">) },
  };
}

/** Spawn and score the starting objects, then commit the game (the start's last step, both halves). */
async function launch(ctx: ActionCtx, settings: GameSettings, deals: readonly Deal[], tables: InstanceTables,
  commit: { roomId: Id<"rooms">; revision: number; memberIds: string[]; requestId?: string; principal?: Principal; prepared?: string; auction?: unknown; rotation?: GameRotation }): Promise<Started | null> {
  const occupied = new Set<ObjectValue>();
  const objects = [], noiseKey = newNoiseKey();
  for (let i = 0; i < settings.startingObjectCount; i++) {
    const value = uniqueSpawn(settings, occupied);
    if (value === undefined) break; // only a nearly full tiny domain gets here
    occupied.add(value);
    const scores = scoresOf(tables, settings, deals, value);
    objects.push({ value: value as number | string, scores, salience: salienceOf(scores), noise: disclosureNoise(settings, noiseKey, value) });
  }
  const next = poissonIntervalSeconds(settings.spawnRateHz, openUniform());
  const args = {
    ...commit,
    seasonCommitment: seasonCommitment(), noiseKey, endAtWorld: gameEndSeconds(settings.durationMode, settings.halfLifeSeconds, openUniform),
    nextSpawn: Number.isFinite(next) ? next : Number.MAX_VALUE, catalog: catalogFor(settings),
    // A god's outcome of the bid phase is on its own card (private like the card): what it won, and its handicap.
    deities: deals.map(d => ({ godId: d.godId, utility: d.utility, card: { ...utilityCard(settings, d.utility), ...(d.bid ? { bid: d.bid, handicap: d.bid.handicap } : {}), ...(d.rotation ? { rotation: d.rotation } : {}) } })),
    objects,
    ...(deals.some(d => d.bid?.handicap) ? { handicaps: deals.map(d => d.bid?.handicap ?? 0) } : {}),
  };
  // The game scores with these tables until it ends, whatever later deploys do to the shipped ones (engine/pinned.ts).
  const tablesStorageId = await storePinned(ctx, pinTables(tables, settings, deals));
  let started: Started | null = null;
  try {
    return started = await ctx.runMutation(internal.game.lobby.commitStart, { ...args, tablesStorageId });
  } finally {
    // Not started (a refused or stale start): no game holds the file. Never let the cleanup hide the start's own error.
    if (!started) await ctx.storage.delete(tablesStorageId).catch(error => console.warn(`pinned tables ${tablesStorageId} not deleted: ${String(error)}`));
  }
}

function preparingResult(p: NonNullable<Doc<"rooms">["preparing"]>): Preparing {
  const view = preparingView(p);
  return { status: "preparing", instance: p.instance, ready: view.ready, total: p.total, estimateSeconds: p.estimateSeconds,
    dealtAs: p.dealer.dealtAs, ...(p.dealer.note ? { note: p.dealer.note } : {}), message: preparingLine(view) };
}

/** The longest start requestId: it is stored on the room's `preparing`, a receipt and scheduled calls' arguments. */
const REQUEST_ID_MAX = 128;
/**
 * The game start (docs/analytic-calibration/architecture.md §3.4). The deal is fixed first, from every available
 * family; then each draw's table is resolved (analytic, shipped, or computed earlier: the common case, and the game
 * starts at once). Missing tables are claimed and computed by a fan-out of Node actions, one per table; the room
 * records the deal and its progress (`preparing`) and the call returns `{ status: "preparing" }`. When the last table
 * lands, calibration/cache.ts finished schedules `completeStart`, which launches the game with that deal: the planning
 * clock starts then. Idempotent per requestId (a repeated start reports the preparation, then the game).
 */
async function startGame(ctx: ActionCtx, args: { roomId: string; requestId?: string; principal?: Principal }): Promise<StartResult> {
  if ((args.requestId?.length ?? 0) > REQUEST_ID_MAX) fail("BAD_REQUEST", `requestId is longer than ${REQUEST_ID_MAX} characters`);
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal: args.principal });
  const room = context.room;
  if (args.requestId) {
    const prior = await ctx.runQuery(internal.game.lobby.receiptFor, { roomId: room._id, actorId: context.ownerId, requestId: `start:${args.requestId}` });
    if (prior) return prior.result as Started;
  }
  if (context.activeGame) fail("CONFLICT", "There is already a live game");
  // A preparation in progress is reported, not restarted; a failed one may be started afresh. So is a bid phase.
  if (room.bidding && !room.bidding.error) return biddingResult(room.bidding);
  if (room.preparing && !room.preparing.error) return preparingResult(room.preparing);
  // Spectators watch: only players are dealt in (docs/unify-apps-plan.md §2).
  const members = context.members.filter(m => !m.spectator);
  if (members.length < 3) fail("BAD_REQUEST", "At least three players are required (spectators don't count)");
  if (members.length > MAX_GODS) fail("BAD_REQUEST", "At most eight players can play");
  const bots = members.filter(m => m.kind === "ai");
  if (bots.length && !context.aiEnabled) fail("FORBIDDEN", `${AI_ADMIN_ONLY}: remove the AI seats to start`);
  for (const bot of bots) {
    if (!bot.aiAgent) fail("BAD_REQUEST", "Every AI seat needs an agent from the library");
    if (!aiProviderAvailable(bot.aiAgent.provider)) fail("UNAVAILABLE", `AI players require a server-side ${bot.aiAgent.provider} API key`);
  }
  // A room the single-language migration has not reached yet plays its one language (upgradeStoredSettings).
  const settings = (upgradeStoredSettings(room.settings) ?? room.settings) as GameSettings;
  const manifest = await calibrationManifest(ctx);
  try { validateSettings(settings, settingsDomain()); } catch (error) { fail("BAD_REQUEST", (error as Error).message); }
  assertShape(manifest, settings);
  // The start never waits for a sandbox to boot (1-2 s on a cold instance): it checks that each allowed language's
  // runtime is deployed and has not just failed, and schedules the warm-ups. Until they report, validate and summon
  // answer "not ready yet" and planning holds past its deadline (lib/sandboxes.ts planningEnd).
  const sandboxes = await ensureSandboxes(ctx, settings.languages, true);
  const down = sandboxes.filter(s => s.state === "failed");
  if (down.length) {
    fail("UNAVAILABLE", down.map(s => `The isolated ${LANGUAGE_SPECS[s.language].label} runtime is unavailable: ${s.reason}`).join("; ").slice(0, 1000));
  }
  const inst = instantiationOf(settings);
  // A setup with a bid phase (docs/bid-phase.md): the deal waits for the bids (completeBidding makes it and carries on).
  if ((settings.bidSeconds ?? 0) > 0) {
    return biddingResult(await ctx.runMutation(internal.bidding.begin, {
      roomId: room._id, principal: args.principal, revision: room.revision, memberIds: members.map(m => m.godId),
      requestId: args.requestId ?? crypto.randomUUID(), seconds: settings.bidSeconds, pricing: settings.bidPricing ?? "first", ...(settings.bidVisibility === "open" ? { open: true } : {}),
    }));
  }
  // Playing again with the same players: the last game's rules pass one seat along (lib/dealRotation.ts).
  const { deals: rotated, game: rotation } = await rotationFor(ctx, room._id, settings, members.map(m => m.godId));
  const dealt = rotated?.map(r => r.utility) ?? deal(settings, members.length);
  const deals: Deal[] = members.map((m, i) => ({ godId: m.godId, utility: dealt[i], ...(rotated ? { rotation: rotated[i]!.rotation } : {}) }));
  let resolved;
  try { resolved = await resolveTables(ctx, inst, drawsOf(dealt), priorOf(settings.priorId), { owner: { id: context.ownerId, roomId: room._id } }); } catch (error) {
    // The rate limit's words reach the owner as they are; anything else is the tables failing.
    if (error instanceof ConvexError && (error.data as { code?: string })?.code === "RATE_LIMITED") throw error;
    return fail("UNAVAILABLE", `The rule tables for this game could not be prepared: ${(error as Error).message}`);
  }
  const commit = { roomId: room._id, revision: room.revision, memberIds: members.map(m => m.godId), requestId: args.requestId, principal: args.principal, ...(rotation ? { rotation } : {}) };
  if (!resolved.pending.length) return (await launch(ctx, settings, deals, resolved.tables, commit))!;
  const keys = [...new Set(resolved.pending.map(p => p.key))];
  const total = new Set([...resolved.ready.map(r => r.key), ...keys]).size;
  const preparing = await ctx.runMutation(internal.game.lobby.beginPreparing, {
    ...commit, requestId: args.requestId ?? crypto.randomUUID(), instance: inst.key, total, pending: keys,
    estimateSeconds: firstUseSeconds(inst), deals, dealer: dealerOf(settings),
  });
  return preparingResult(preparing!);
}

/**
 * The end of a start's bid phase (bidding.ts): at its deadline, or as soon as every human player is done, deal the game
 * with the bids (game-utilities dealWithBids: winners hold their families exclusively, everyone else is dealt by the
 * dealer from the rest; no bids: the dealer's own deal) and hand the deal to the start's second half through the room's
 * `preparing`, exactly as a start without bidding that had tables to wait for. A player who left during bidding is not
 * dealt in and their bids are dropped; with fewer than three players left the start fails and the owner starts again.
 * Runs again every BIDDING_WATCHDOG_MS until the bid phase is the room's no longer (a run that died is retried).
 */
export const completeBidding = internalAction({
  args: { roomId: v.id("rooms"), requestId: v.string() },
  handler: async (ctx, { roomId, requestId }): Promise<void> => {
    const state = await ctx.runMutation(internal.bidding.takeForDeal, { roomId, requestId });
    if (state.state === "gone") return;
    if (state.state === "wait") return void await ctx.scheduler.runAfter(state.wait, internal.owner.completeBidding, { roomId, requestId });
    await ctx.scheduler.runAfter(BIDDING_WATCHDOG_MS, internal.owner.completeBidding, { roomId, requestId });
    const failWith = (message: string) => ctx.runMutation(internal.bidding.failed, { roomId, requestId, message });
    const { room, bidding, playerIds, bids } = state;
    try {
      if (playerIds.length < 3) return void await failWith("Players left during bidding and fewer than three remain. Start again.");
      const settings = (upgradeStoredSettings(room.settings) ?? room.settings) as GameSettings;
      const inst = instantiationOf(settings);
      const { deal: dealt, wins, dropped } = dealWithBidsFor(settings, playerIds, bids);
      // Nobody won a bid: the deal carries no trace of the bid phase (the game is the one a start without it deals).
      const deals: Deal[] = playerIds.map((godId, i) => {
        if (!wins.length) return { godId, utility: dealt[i] };
        const win = wins.find(w => w.playerId === godId);
        const mine = bids.filter(b => b.playerId === godId).map(b => ({ familyId: b.familyId, percent: b.percent }));
        return { godId, utility: dealt[i], bid: win
          ? { won: true, familyId: win.familyId, percent: win.percent, handicap: win.handicap, pricing: bidding.pricing, bids: mine }
          : { won: false, handicap: 0, pricing: bidding.pricing, bids: mine } };
      });
      const auction: AuctionRecord | undefined = wins.length ? {
        pricing: bidding.pricing,
        bids: bids.map(b => ({ godId: b.playerId, familyId: b.familyId, percent: b.percent })),
        wins: wins.map(w => ({ godId: w.playerId, familyId: w.familyId, percent: w.percent, handicap: w.handicap })),
        dropped: dropped.map(w => ({ godId: w.playerId, familyId: w.familyId, percent: w.percent })),
      } : undefined;
      const resolved = await resolveTables(ctx, inst, drawsOf(dealt), priorOf(settings.priorId), { owner: { id: bidding.ownerId, roomId } });
      const keys = [...new Set(resolved.pending.map(p => p.key))];
      const total = new Set([...resolved.ready.map(r => r.key), ...keys]).size;
      // With every table ready the second half (completeStart) is scheduled at once by beginPreparing.
      await ctx.runMutation(internal.game.lobby.beginPreparing, {
        roomId, revision: bidding.revision, memberIds: playerIds, requestId, instance: inst.key, total, pending: keys,
        estimateSeconds: firstUseSeconds(inst), deals, dealer: dealerOf(settings), bidding: requestId, ...(auction ? { auction } : {}),
      });
    } catch (error) {
      await failWith(`The game could not be dealt after bidding: ${error instanceof ConvexError ? (error.data as { message?: string })?.message ?? String(error.data) : (error as Error).message}. Start again.`);
    }
  },
});

/**
 * The start's second half: the tables of the preparing room's deal are all ready (or, as the watchdog, check whether
 * they are: a computation that crashed is restarted by its claim, and one past MAX_PREPARING_MS is reported). Launches
 * the game with the recorded deal, or records why it cannot.
 */
export const completeStart = internalAction({
  args: { roomId: v.id("rooms"), requestId: v.string(), watchdog: v.optional(v.boolean()) },
  handler: async (ctx, { roomId, requestId, watchdog }): Promise<void> => {
    const room = await ctx.runQuery(internal.game.queries.roomForEngine, { roomId });
    const p = room?.preparing;
    if (!room || !p || p.requestId !== requestId || p.error) return;
    const settings = (upgradeStoredSettings(room.settings) ?? room.settings) as GameSettings;
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
    // If this run dies before the launch or the failure is recorded (both mutations conflicting, a timeout), the room
    // would show "preparing" for ever: a later run retries (and returns at once once `preparing` is gone or failed).
    await ctx.scheduler.runAfter(PREPARING_WATCHDOG_MS, internal.owner.completeStart, { roomId, requestId, watchdog: true });
    try {
      await launch(ctx, settings, p.deals as Deal[], resolved.tables, { roomId, revision: p.revision, memberIds: p.memberIds, requestId, prepared: requestId,
        ...(p.auction !== undefined ? { auction: p.auction } : {}), ...(p.rotation ? { rotation: p.rotation } : {}) });
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
  handler: async (ctx, args): Promise<StartResult> => { return startGame(ctx, args); },
});

const commandArgs = {
  roomId: v.string(),
  action: v.union(v.literal("settings"), v.literal("quotas"), v.literal("start"), v.literal("resume"), v.literal("endGame"), v.literal("addAi"), v.literal("removeAi")),
  requestId: v.optional(v.string()), revision: v.optional(v.number()), settings: v.optional(v.any()), setupId: v.optional(v.string()),
  aiQuota: v.optional(v.number()), assistantQuota: v.optional(v.number()), assistantModel: v.optional(v.string()),
  aiAgentId: v.optional(v.string()), deityId: v.optional(v.string()),
};
type CommandArgs = { roomId: string; action: "settings" | "quotas" | "start" | "resume" | "endGame" | "addAi" | "removeAi"; requestId?: string; revision?: number;
  settings?: Record<string, unknown>; setupId?: string; aiQuota?: number; assistantQuota?: number; assistantModel?: string; aiAgentId?: string; deityId?: string };

/** One owner action as the authenticated caller, or as the human behind `principal` (the agent registry's owner tools). */
async function ownerCommand(ctx: ActionCtx, args: CommandArgs, principal?: Principal): Promise<unknown> {
  const context = await ctx.runQuery(internal.game.lobby.ownerContext, { room: args.roomId, principal });
  const roomId = context.room._id;
  switch (args.action) {
    case "settings":
      if (args.revision === undefined) return fail("BAD_REQUEST", "revision is required");
      return updateSettings(ctx, { roomId, revision: args.revision, settings: args.settings, setupId: args.setupId, principal });
    case "quotas": {
      const quotas = { roomId, aiQuota: args.aiQuota, assistantQuota: args.assistantQuota, assistantModel: args.assistantModel };
      return principal ? ctx.runMutation(internal.rooms.setAiQuotasAs, { principal, ...quotas }) : ctx.runMutation(api.rooms.setAiQuotas, quotas);
    }
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
  handler: async (ctx, args): Promise<unknown> => { return ownerCommand(ctx, args); },
});
/** Internal twin of `command` for a principal {credentialId} (the agent registry's owner tools). */
export const commandAs = internalAction({
  args: { principal: principalV, ...commandArgs },
  handler: async (ctx, { principal, ...args }): Promise<unknown> => { return ownerCommand(ctx, args, principal); },
});
