/**
 * Player commands (protocol v3 envelopes): chat, ready, pause, validate, summon, destroy. One apply path for
 * humans (browser or player credential with `act`) and AI seats, with idempotent receipts per
 * (room, god, commandId): the same envelope returns the stored receipt, a reused id with different content
 * is rejected. Rejected commands also get a receipt. Validate and summon arrive pre-examined by the Node
 * action (commands.ts), and are re-checked here: game, phase, seat, energy and the agent cap.
 */
import { ConvexError, v } from "convex/values";
import { allowedLanguages, assertShare, defaultShare, newAgentAccount, roundShare, spendDeityEnergy, upgradeStoredSettings, type GameSettings, type Language } from "@workspace/game-core";
import { sha256 } from "@workspace/game-types";
import { GAME_COMMANDS, envelopeSchema, type CommandResult, type Envelope } from "@workspace/player-client";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { appendEvents } from "../engine/loop";
import { withEngine, writeGame } from "./state";
import { fail, messageOf } from "../lib/errors";
import { memberOf, principalV, requireMemberAs, requireRoom, viewerOf, type Principal } from "../lib/rooms";
import { godEnergy, settledAccount, worldNow } from "../lib/world";
import { deityAccount, deityCapacityOf } from "../lib/power";
import { agentLanguage, languageV } from "../lib/language";
import { dryRunVerdict, summonDryRunWarnings } from "../lib/dryRun";

const CHAT_INTERVAL_MS = 1000;
/** Agent examinations (validate, summon) per human per room per rolling minute: a looping client cannot burn the sandbox. */
export const EXAMINATIONS_PER_MINUTE = 30;
const EXAMINATION_WINDOW_MS = 60_000;

export const envelopeHash = (envelope: Envelope) => sha256(JSON.stringify(envelope));
const receiptKey = (commandId: string) => `client:${commandId}`;

/**
 * The acting god: the authenticated human (with `act`), the human behind a principal (agent tools,
 * scheduled commands), or an AI seat (engine-internal callers only).
 */
async function actorFor(ctx: QueryCtx | MutationCtx, room: Doc<"rooms">, asAi: string | undefined, principal: Principal | undefined) {
  if (asAi !== undefined) {
    const member = await memberOf(ctx, room._id, asAi);
    if (!member || member.kind !== "ai") fail("FORBIDDEN", "Unknown AI seat");
    return member;
  }
  return (await requireMemberAs(ctx, await viewerOf(ctx, principal), room, "act")).member;
}
export async function findReceipt(ctx: QueryCtx | MutationCtx, roomId: Id<"rooms">, actorId: string, commandId: string) {
  return ctx.db.query("receipts").withIndex("by_key", q => q.eq("roomId", roomId).eq("actorId", actorId).eq("requestId", receiptKey(commandId))).unique();
}

/** What the Node action needs before examining an agent; also answers repeats from the stored receipt. */
export const prepare = internalQuery({
  args: { roomId: v.string(), asAi: v.optional(v.string()), principal: v.optional(principalV), envelope: v.any() },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    const member = await actorFor(ctx, room, args.asAi, args.principal);
    const envelope = envelopeSchema.parse(args.envelope);
    const prior = await findReceipt(ctx, room._id, member.godId, envelope.commandId);
    const game = room.currentGameId ? await ctx.db.get(room.currentGameId) : null;
    const command = envelope.command;
    let examine: null | { settings: GameSettings; live: (number | string)[]; twins: number } = null;
    if (!prior && game && (command.type === "validate" || command.type === "summon") && envelope.gameId === game._id &&
        allowedLanguages(game.settings as GameSettings).includes(command.language) && game.phase !== "ended" && game.phase !== "recovery" &&
        game.roster.some(m => m.id === member.godId)) {
      const live = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
      // A game the single-language migration has not reached yet is examined as its one language (validateSettings needs the set).
      const settings = (upgradeStoredSettings(game.settings, true) ?? game.settings) as GameSettings;
      // The player's live agents running this exact code (the copies warning), read here, off the mutation's read set.
      const own = await ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", game._id).eq("ownerId", member.godId)).take(settings.maxAgentsPerGod + 1);
      const twins = own.filter(a => a.source === command.source && agentLanguage(a, settings) === command.language).length;
      examine = { settings, live: live.map(o => o.value), twins };
    }
    return { roomId: room._id, godId: member.godId, prior: prior ? { hash: prior.hash, result: prior.result as CommandResult } : null, examine };
  },
});

/** The summon-time futility probe (game-types probeFutility, docs/rules-design.md §11). */
const futilityV = v.object({ deterministic: v.boolean(), constant: v.boolean(), idempotent: v.boolean(), identity: v.boolean(),
  firstPass: v.number(), secondPass: v.number(), successRate: v.number() });
type Futility = { deterministic: boolean; constant: boolean; idempotent: boolean; identity: boolean; firstPass: number; secondPass: number; successRate: number };

/** The warning for a validate or summon of code the player already runs `twins` agents of. */
export function copiesWarning(twins: number, futility?: Futility): string {
  const same = `You already have ${twins === 1 ? "an agent" : `${twins} agents`} with this exact code`;
  if (futility?.deterministic && (futility.constant || futility.idempotent || futility.identity)) {
    return `${same}: a copy gives each object the same result, so it only adds failed acts.`;
  }
  return `${same}: a copy acts the same way on the objects it is given, so it adds speed only when they cannot keep up.`;
}

const examinedV = v.object({
  gameId: v.string(), source: v.string(), language: languageV,
  error: v.optional(v.string()),
  result: v.optional(v.object({
    cost: v.number(), parts: v.any(), expectedActCost: v.number(),
    breakdown: v.object({ read: v.number(), change: v.number() }),
    randomized: v.boolean(), diagnostics: v.array(v.string()),
    changeRate: v.optional(v.number()), invalidRate: v.optional(v.number()), skipRate: v.optional(v.number()),
    futility: v.optional(futilityV), warnings: v.optional(v.array(v.string())),
    firstError: v.optional(v.string()),
  })),
  /** The player's live agents with this exact code and language when it was examined (the copies warning). */
  twins: v.optional(v.number()),
});

export const apply = internalMutation({
  args: { roomId: v.id("rooms"), asAi: v.optional(v.string()), principal: v.optional(principalV), envelope: v.any(), examined: v.optional(examinedV) },
  handler: async (ctx, args): Promise<CommandResult> => {
    const room = await requireRoom(ctx, args.roomId);
    const member = await actorFor(ctx, room, args.asAi, args.principal);
    const envelope = envelopeSchema.parse(args.envelope);
    const hash = envelopeHash(envelope);
    const prior = await findReceipt(ctx, room._id, member.godId, envelope.commandId);
    if (prior) {
      if (prior.hash !== hash) fail("CONFLICT", "Command ID was reused with different content");
      return prior.result as CommandResult;
    }
    const command = envelope.command;
    let receipt: CommandResult;
    try {
      const result = await run(ctx, room, member, envelope, args.examined);
      receipt = { commandId: envelope.commandId, accepted: true, message: "Accepted",
        ...(command.type === "validate" ? { validation: result as NonNullable<CommandResult["validation"]> } : {}),
        // A summon is never refused for what the examination found: it is told, with the agent summoned.
        ...(command.type === "summon" && (result as { warnings?: string[] }).warnings ? { warnings: (result as { warnings: string[] }).warnings } : {}) };
    } catch (error) {
      // A transient failure (the sandbox could not examine the agent) is not the command's outcome: no
      // receipt, so the client's retry of the identical envelope runs it.
      if (error instanceof ConvexError && (error.data as { code?: string })?.code === "UNAVAILABLE") throw error;
      const message = messageOf(error);
      receipt = { commandId: envelope.commandId, accepted: false, message: message.slice(0, 2000),
        ...(command.type === "validate" ? { validation: { valid: false, cost: 0, expectedActCost: 0, diagnostics: [message.slice(0, 1000)] } } : {}) };
    }
    await ctx.db.insert("receipts", { roomId: room._id, actorId: member.godId, requestId: receiptKey(envelope.commandId), hash, result: receipt, createdAt: Date.now() });
    return receipt;
  },
});

/**
 * Count one agent examination for this god in this room, before the Node action runs it, or throw RATE_LIMITED
 * (no receipt is stored, so the identical envelope can be sent again later). Per god, not per credential: every
 * client and agent of one human shares the cap. Old rows of this god are deleted as it goes.
 */
export const claimExamination = internalMutation({
  args: { roomId: v.id("rooms"), godId: v.string() },
  handler: async (ctx, { roomId, godId }) => {
    const now = Date.now();
    for (const old of await ctx.db.query("examinations").withIndex("by_room_god_at", q => q.eq("roomId", roomId).eq("godId", godId).lt("at", now - EXAMINATION_WINDOW_MS)).take(64)) {
      await ctx.db.delete(old._id);
    }
    const recent = await ctx.db.query("examinations").withIndex("by_room_god_at", q => q.eq("roomId", roomId).eq("godId", godId).gte("at", now - EXAMINATION_WINDOW_MS))
      .take(EXAMINATIONS_PER_MINUTE);
    if (recent.length >= EXAMINATIONS_PER_MINUTE) {
      const wait = Math.max(1, Math.ceil((recent[0].at + EXAMINATION_WINDOW_MS - now) / 1000));
      fail("RATE_LIMITED", `At most ${EXAMINATIONS_PER_MINUTE} agent checks a minute (validate and summon together); try again in ${wait} s with the same command`);
    }
    await ctx.db.insert("examinations", { roomId, godId, at: now });
  },
});

type Examined = { gameId: string; source: string; language: Language; error?: string; twins?: number; result?: { cost: number; parts: unknown; expectedActCost: number;
  breakdown: { read: number; change: number }; randomized: boolean; diagnostics: string[];
  changeRate?: number; invalidRate?: number; skipRate?: number; futility?: Futility; warnings?: string[] } };

async function run(ctx: MutationCtx, room: Doc<"rooms">, member: Doc<"members">, envelope: Envelope, examined: Examined | undefined): Promise<unknown> {
  const command = envelope.command, now = Date.now();
  const stored = room.currentGameId ? await ctx.db.get(room.currentGameId) : null;
  const game = stored && await withEngine(ctx, stored);
  if (GAME_COMMANDS.includes(command.type) && !envelope.gameId) fail("BAD_REQUEST", "Game ID is required");
  if (envelope.gameId && envelope.gameId !== game?._id) fail("CONFLICT", "Stale game");
  if ("language" in command && !(game && allowedLanguages(game.settings as GameSettings).includes(command.language))) {
    fail("BAD_REQUEST", `This game does not allow ${command.language} agents${game ? ` (allowed: ${allowedLanguages(game.settings as GameSettings).join(", ")})` : ""}`);
  }

  if (command.type === "chat") {
    const text = command.text;
    if (!text.trim() || text.length > 2000) fail("BAD_REQUEST", "Chat text must be 1–2000 characters");
    const last = await ctx.db.query("chat").withIndex("by_room_author", q => q.eq("roomId", room._id).eq("authorId", member.godId)).order("desc").first();
    if (last && now - last.timestamp < CHAT_INTERVAL_MS) fail("RATE_LIMITED", "Chat rate limit");
    // Chat belongs to the room; a message sent while a game is live is stamped with that game and its world time, so
    // the game's replay places it exactly (docs/replay-design.md §2.3).
    const stamp = game && game._id === room.activeGameId && game.phase !== "ended" ? { gameId: game._id, world: worldNow(game, now) } : {};
    const id = await ctx.db.insert("chat", { roomId: room._id, authorId: member.godId, authorName: member.name, kind: member.kind, text, timestamp: now, ...stamp });
    return { id };
  }
  if (command.type === "ready") {
    if (member.spectator) fail("BAD_REQUEST", "Spectators have no ready state; play the next game first");
    await ctx.db.patch(member._id, { ready: command.ready });
    await ctx.db.patch(room._id, { seq: room.seq + 1 });
    return { ready: command.ready };
  }
  if (!game) return fail("CONFLICT", "Stale game");
  if (game.phase === "ended" || game.phase === "recovery") fail("CONFLICT", "Game is not accepting commands");
  const deity = await ctx.db.query("deities").withIndex("by_game_god", q => q.eq("gameId", game._id).eq("godId", member.godId)).unique();
  if (!deity) return fail("FORBIDDEN", "You are observing until the next game");
  const settings = game.settings as GameSettings;

  if (command.type === "pause") {
    // Say why, so a player (or an agent) knows whether to wait or give up.
    if (deity.pauseUsed) fail("CONFLICT", "You have used your one pause this game");
    if (game.phase === "paused") fail("CONFLICT", "The game is already paused");
    if (game.phase !== "running") fail("CONFLICT", `Pausing works only while the game is running (it is ${game.phase})`);
    const world = worldNow(game, now);
    if (world >= game.endAtWorld) fail("CONFLICT", "The game is ending and can no longer be paused");
    const pauseEndsAt = now + settings.pauseSeconds * 1000;
    const paused = { ...game, worldSeconds: world };
    const nextBatch = await appendEvents(ctx, paused, [{ t: "phase", phase: "paused", world, reason: `paused by ${member.name}` }], world, world);
    // Bumping the epoch discards the window in flight; its commit reschedules the loop at pauseEndsAt.
    await writeGame(ctx, game, { phase: "paused", worldSeconds: world, lastTick: now, pauseEndsAt, executionEpoch: game.executionEpoch + 1, nextBatch });
    await ctx.db.patch(deity._id, { pauseUsed: true });
    return { pauseEndsAt };
  }
  if (command.type === "validate" || command.type === "summon") {
    if (!examined || examined.gameId !== game._id || examined.source !== command.source || examined.language !== command.language) fail("UNAVAILABLE", "The agent could not be examined; retry");
    if (examined.error !== undefined || !examined.result) return fail("BAD_REQUEST", examined.error ?? "Examination failed");
    const e = examined.result;
    // Copies of the player's own live agents: the same code acts the same way on the same objects.
    const twins = examined.twins ?? 0;
    // The dry run's verdict (lib/dryRun.ts): failing on every sample object is INVALID; never moving is a warning.
    const dry = dryRunVerdict(e);
    // A dry-run finding says it all: the futility warnings of the same runs ("never changes an object") would only repeat it.
    const found = !dry.valid || dry.warnings.length > 0;
    // A validation says an invalid agent in its verdict and diagnostics; a summon is not refused for it (callers that
    // summoned such agents before do not all handle a refusal), so its receipt carries the finding as a warning.
    const dryWarnings = command.type === "summon" ? summonDryRunWarnings(dry) : dry.warnings;
    const warnings = [...dryWarnings, ...(found ? [] : e.warnings ?? []), ...(twins ? [copiesWarning(twins, e.futility)] : [])];
    const findings = { ...(e.futility ? { futility: e.futility, expectedSuccessRate: e.futility.successRate } : {}), ...(warnings.length ? { warnings } : {}) };
    if (command.type === "validate") {
      const energy = godEnergy(game, deity, worldNow(game, now));
      const diagnostics = [...(dry.lead ? [dry.lead] : []), ...(dry.detail ? [dry.detail] : []), ...e.diagnostics];
      return { valid: dry.valid, cost: e.cost, parts: e.parts, expectedActCost: e.expectedActCost,
        breakdown: e.breakdown, randomized: e.randomized, diagnostics: diagnostics.slice(0, 30).map(d => d.slice(0, 1000)),
        ...(e.changeRate !== undefined ? { changeRate: e.changeRate } : {}), ...(e.invalidRate !== undefined ? { invalidRate: e.invalidRate } : {}),
        ...(e.skipRate !== undefined ? { skipRate: e.skipRate } : {}),
        ...findings, energy, affordable: energy >= e.cost };
    }
    const world = worldNow(game, now);
    const own = deityAccount(game, deity, world);
    if (own.balance < e.cost) {
      // Capacity (docs/energy-model.md §6.1): a price above what the unallocated power can ever store needs more power kept.
      const capacity = deityCapacityOf(deity, settings);
      fail("CONFLICT", e.cost > capacity
        ? `Insufficient energy: this agent costs ${e.cost.toFixed(0)} bits, but your own energy holds at most ${capacity.toFixed(0)} bits with ${(100 * Math.max(0, 1 - deity.allocated)).toFixed(0)}% of your power unallocated. Take power back from an agent first (allocatePower), or write a smaller agent`
        : "Insufficient energy");
    }
    const owned = await ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", game._id).eq("ownerId", member.godId)).take(settings.maxAgentsPerGod + 1);
    if (owned.length >= settings.maxAgentsPerGod) fail("CONFLICT", `This god has reached the ${settings.maxAgentsPerGod}-agent resource limit`);
    // Power (docs/energy-model.md §6): the new agent's share comes out of what the deity has not allocated.
    const allocated = deity.allocated;
    if (command.powerShare === undefined && allocated >= 1 - 1e-9) fail("BAD_REQUEST", "All your power is given to your agents, so a new agent would never act: take some from another agent first (allocatePower), or summon with a powerShare");
    const powerShare = roundShare(command.powerShare ?? defaultShare(allocated));
    if (allocated + powerShare > 1 + 1e-9) fail("BAD_REQUEST", `Only ${(100 * Math.max(0, 1 - allocated)).toFixed(0)}% of your power is unallocated: give the new agent at most that, or take some from another agent first`);
    const record = {
      summonCost: e.cost, expectedActCost: e.expectedActCost, powerShare,
      breakdown: e.breakdown, randomized: e.randomized, account: newAgentAccount(world),
    };
    const agentId = await ctx.db.insert("agents", { gameId: game._id, ownerId: member.godId, source: command.source, language: command.language, createdAt: now, name: command.name, ...(command.description ? { description: command.description } : {}), ...record, acts: 0, spent: 0 });
    await ctx.db.patch(deity._id, { spent: deity.spent + e.cost, account: spendDeityEnergy(own, e.cost), allocated: roundShare(allocated + powerShare) });
    // The summon is in the event log with the agent's whole record (its source stays its owner's), so a replay has
    // every agent, destroyed ones included, and its energy from then on (docs/replay-design.md §2).
    const nextBatch = await appendEvents(ctx, game, [{ t: "summon", agentId, ownerId: member.godId, world, language: command.language, source: command.source, name: command.name, ...(command.description ? { description: command.description } : {}), ...record }], world, world);
    await writeGame(ctx, game, { agentCount: game.agentCount + 1, nextBatch });
    return { id: agentId, summonCost: e.cost, expectedActCost: e.expectedActCost, powerShare, ...(warnings.length ? { warnings } : {}) };
  }
  if (command.type === "destroy") {
    // Gods may destroy their own agents at any time, for free. Energy already spent is not refunded.
    const id = ctx.db.normalizeId("agents", command.agentId);
    const agent = id ? await ctx.db.get(id) : null;
    if (!agent || agent.gameId !== game._id || agent.ownerId !== member.godId) fail("NOT_FOUND", "You have no agent with that ID");
    const world = worldNow(game, now);
    // Its power share returns to the deity (settled first: the deity's income changes from now).
    await ctx.db.patch(deity._id, { account: deityAccount(game, deity, world), allocated: roundShare(Math.max(0, deity.allocated - agent.powerShare)) });
    await ctx.db.delete(agent._id);
    const memo = await ctx.db.query("futileActs").withIndex("by_agent", q => q.eq("agentId", agent._id)).unique();
    if (memo) await ctx.db.delete(memo._id);
    const nextBatch = await appendEvents(ctx, game, [{ t: "destroy", agentId: agent._id, ownerId: member.godId, world }], world, world);
    await writeGame(ctx, game, { agentCount: Math.max(0, game.agentCount - 1), nextBatch });
    return { destroyed: agent._id };
  }
  if (command.type === "allocatePower") {
    // Re-allocate (docs/energy-model.md §6): both accounts are settled at the old rates first, then the share changes.
    const id = ctx.db.normalizeId("agents", command.agentId);
    const agent = id ? await ctx.db.get(id) : null;
    if (!agent || agent.gameId !== game._id || agent.ownerId !== member.godId) fail("NOT_FOUND", "You have no agent with that ID");
    const share = roundShare(command.share);
    assertShare(share);
    const world = worldNow(game, now);
    const others = deity.allocated - agent.powerShare;
    if (others + share > 1 + 1e-9) fail("BAD_REQUEST", `Your other agents hold ${(100 * others).toFixed(0)}% of your power: this one can have at most ${(100 * Math.max(0, 1 - others)).toFixed(0)}%`);
    await ctx.db.patch(agent._id, { account: settledAccount(settings, agent, world), powerShare: share });
    await ctx.db.patch(deity._id, { account: deityAccount(game, deity, world), allocated: roundShare(others + share) });
    const nextBatch = await appendEvents(ctx, game, [{ t: "power", agentId: agent._id, ownerId: member.godId, world, share }], world, world);
    // Bumping the epoch discards a window in flight (simulated at the old share), as a pause does: its commit would
    // overwrite the account settled here.
    await writeGame(ctx, game, { nextBatch, executionEpoch: game.executionEpoch + 1 });
    return { agentId: agent._id, share, allocated: roundShare(others + share) };
  }
  return fail("BAD_REQUEST", "Unknown command");
}

