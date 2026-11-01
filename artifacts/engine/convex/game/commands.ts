/**
 * Player commands (protocol v3 envelopes): chat, ready, pause, validate, summon, destroy. One apply path for
 * humans (browser or player credential with `act`) and AI seats, with idempotent receipts per
 * (room, god, commandId): the same envelope returns the stored receipt, a reused id with different content
 * is rejected. Rejected commands also get a receipt. Validate and summon arrive pre-examined by the Node
 * action (commands.ts), and are re-checked here: game, phase, seat, energy and the agent cap.
 */
import { ConvexError, v } from "convex/values";
import { allowedLanguages, newAgentAccount, upgradeLegacyLanguage, type GameSettings, type Language } from "@workspace/game-core";
import { sha256 } from "@workspace/game-types";
import { GAME_COMMANDS, envelopeSchema, type CommandResult, type Envelope } from "@workspace/player-client";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { appendEvents } from "../engine/loop";
import { fail, messageOf } from "../lib/errors";
import { memberOf, principalV, requireMemberAs, requireRoom, viewerOf, type Principal } from "../lib/rooms";
import { godEnergy, worldNow } from "../lib/world";
import { languageV } from "../lib/language";

const CHAT_INTERVAL_MS = 1000;

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
    let examine: null | { settings: GameSettings; live: (number | string)[] } = null;
    if (!prior && game && (command.type === "validate" || command.type === "summon") && envelope.gameId === game._id &&
        allowedLanguages(game.settings as GameSettings).includes(command.language) && game.phase !== "ended" && game.phase !== "recovery" &&
        game.roster.some(m => m.id === member.godId)) {
      const live = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
      // A game the single-language migration has not reached yet is examined as its one language (validateSettings needs the set).
      examine = { settings: (upgradeLegacyLanguage(game.settings) ?? game.settings) as GameSettings, live: live.map(o => o.value) };
    }
    return { roomId: room._id, godId: member.godId, prior: prior ? { hash: prior.hash, result: prior.result as CommandResult } : null, examine };
  },
});

const examinedV = v.object({
  gameId: v.string(), source: v.string(), language: languageV,
  error: v.optional(v.string()),
  result: v.optional(v.object({
    cost: v.number(), parts: v.any(), decisionBits: v.number(), expectedActCost: v.number(),
    breakdown: v.object({ decision: v.number(), erasure: v.number(), motion: v.number(), floor: v.number() }),
    randomized: v.boolean(), diagnostics: v.array(v.string()),
  })),
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
        ...(command.type === "validate" ? { validation: result as NonNullable<CommandResult["validation"]> } : {}) };
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

type Examined = { gameId: string; source: string; language: Language; error?: string; result?: { cost: number; parts: unknown; decisionBits: number; expectedActCost: number;
  breakdown: { decision: number; erasure: number; motion: number; floor: number }; randomized: boolean; diagnostics: string[] } };

async function run(ctx: MutationCtx, room: Doc<"rooms">, member: Doc<"members">, envelope: Envelope, examined: Examined | undefined): Promise<unknown> {
  const command = envelope.command, now = Date.now();
  const game = room.currentGameId ? await ctx.db.get(room.currentGameId) : null;
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
    if (game.phase !== "running" || deity.pauseUsed) fail("CONFLICT", "Pause is unavailable");
    const world = worldNow(game, now);
    if (world >= game.endAtWorld) fail("CONFLICT", "Pause is unavailable");
    const pauseEndsAt = now + settings.pauseSeconds * 1000;
    const paused = { ...game, worldSeconds: world };
    const nextBatch = await appendEvents(ctx, paused, [{ t: "phase", phase: "paused", world, reason: `paused by ${member.name}` }], world, world);
    // Bumping the epoch discards the window in flight; its commit reschedules the loop at pauseEndsAt.
    await ctx.db.patch(game._id, { phase: "paused", worldSeconds: world, lastTick: now, pauseEndsAt, executionEpoch: game.executionEpoch + 1, nextBatch });
    await ctx.db.patch(deity._id, { pauseUsed: true });
    return { pauseEndsAt };
  }
  if (command.type === "validate" || command.type === "summon") {
    if (!examined || examined.gameId !== game._id || examined.source !== command.source || examined.language !== command.language) fail("UNAVAILABLE", "The agent could not be examined; retry");
    if (examined.error !== undefined || !examined.result) return fail("BAD_REQUEST", examined.error ?? "Examination failed");
    const e = examined.result;
    if (command.type === "validate") {
      return { valid: true, cost: e.cost, parts: e.parts, decisionBits: e.decisionBits, expectedActCost: e.expectedActCost,
        breakdown: e.breakdown, randomized: e.randomized, diagnostics: e.diagnostics.slice(0, 30).map(d => d.slice(0, 1000)) };
    }
    if (godEnergy(game, deity.spent, now) < e.cost) fail("CONFLICT", "Insufficient energy");
    const owned = await ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", game._id).eq("ownerId", member.godId)).take(settings.maxAgentsPerGod + 1);
    if (owned.length >= settings.maxAgentsPerGod) fail("CONFLICT", `This god has reached the ${settings.maxAgentsPerGod}-agent resource limit`);
    const world = worldNow(game, now);
    const record = {
      summonCost: e.cost, decisionBits: e.decisionBits, expectedActCost: e.expectedActCost, perActFloorBits: settings.perActFloorBits,
      breakdown: e.breakdown, randomized: e.randomized, account: newAgentAccount(world),
    };
    const agentId = await ctx.db.insert("agents", { gameId: game._id, ownerId: member.godId, source: command.source, language: command.language, createdAt: now, ...record, acts: 0, spent: 0 });
    await ctx.db.patch(deity._id, { spent: deity.spent + e.cost });
    // The summon is in the event log with the agent's whole record (its source stays its owner's), so a replay has
    // every agent, destroyed ones included, and its energy from then on (docs/replay-design.md §2).
    const nextBatch = await appendEvents(ctx, game, [{ t: "summon", agentId, ownerId: member.godId, world, language: command.language, source: command.source, ...record }], world, world);
    await ctx.db.patch(game._id, { agentCount: (game.agentCount ?? 0) + 1, nextBatch });
    return { id: agentId, summonCost: e.cost, decisionBits: e.decisionBits, expectedActCost: e.expectedActCost };
  }
  if (command.type === "destroy") {
    // Gods may destroy their own agents at any time, for free. Energy already spent is not refunded.
    const id = ctx.db.normalizeId("agents", command.agentId);
    const agent = id ? await ctx.db.get(id) : null;
    if (!agent || agent.gameId !== game._id || agent.ownerId !== member.godId) fail("NOT_FOUND", "You have no agent with that ID");
    await ctx.db.delete(agent._id);
    const world = worldNow(game, now);
    const nextBatch = await appendEvents(ctx, game, [{ t: "destroy", agentId: agent._id, ownerId: member.godId, world }], world, world);
    await ctx.db.patch(game._id, { agentCount: Math.max(0, (game.agentCount ?? 1) - 1), nextBatch });
    return { destroyed: agent._id };
  }
  return fail("BAD_REQUEST", "Unknown command");
}

