import { z } from "zod";
import { LANGUAGES, RETIRED_LANGUAGES, type Language, type StoredLanguage } from "@workspace/game-core";

/**
 * Player protocol v3 (docs/player-client-integration.md has the migration note from v2).
 * v3 carries information scoring (bits, not [0, 1] utilities), agents that return mutator calls with
 * their own energy accounts, the instantiation the room plays (InstanceInfo) and the kid utility card.
 */
export const VERSION = "code-gods.player.v3" as const;
const id = z.string().min(1).max(128);
const finite = z.number().finite();
const count = z.number().int().nonnegative();
/** An agent language (game-core LANGUAGES). */
const language = z.enum(LANGUAGES as [Language, ...Language[]]);
/** A stored agent's language: one of LANGUAGES, or a retired one (a past game's agent keeps it). */
const storedLanguage = z.enum([...LANGUAGES, ...RETIRED_LANGUAGES] as unknown as [StoredLanguage, ...StoredLanguage[]]);
const wire = z.union([finite, z.string().max(1024)]);
const program = { language, source: z.string().min(1).max(16384).refine(source=>new TextEncoder().encode(source).length<=16384,"Source exceeds 16384 UTF-8 bytes") };
/** An agent's name (required on summon) and description (optional): shown to its owner, and in an ended game's replay. */
export const AGENT_NAME_MAX = 40;
export const AGENT_DESCRIPTION_MAX = 500;
const agentName = z.string().trim().min(1).max(AGENT_NAME_MAX);
const agentDescription = z.string().trim().max(AGENT_DESCRIPTION_MAX);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate"), ...program }).strict(),
  // powerShare: the share of your power the new agent earns (0–1; default half of what you have not allocated).
  z.object({ type: z.literal("summon"), ...program, name: agentName, description: agentDescription.optional(), powerShare: z.number().min(0).max(1).optional() }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(2000) }).strict(),
  // Gods may destroy their own agents at any time, for free.
  z.object({ type: z.literal("destroy"), agentId: id }).strict(),
  // Re-allocate your power (docs/energy-model.md §6): the agent's share from now on; your shares may total at most 1.
  z.object({ type: z.literal("allocatePower"), agentId: id, share: z.number().min(0).max(1) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
/** Commands that act on the current game and therefore need its gameId. */
export const GAME_COMMANDS: readonly Command["type"][] = ["validate", "summon", "pause", "destroy", "allocatePower"];
/**
 * Validate and summon measure the agent on the server (a few hundred sandboxed runs; a few seconds,
 * longer for agents that use random), so they get a longer deadline than other commands.
 */
export const commandTimeoutMs = (command: Command) => (command.type === "validate" || command.type === "summon" ? 120000 : 15000);
export const envelopeSchema = z.object({
  version: z.literal(VERSION), commandId: z.string().uuid(), command: commandSchema,
  gameId: id.optional(),
}).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
/** An ordinal utility: a whole number or a fixed-arity tuple, compared lexicographically (bigger is better). */
const ordinal = z.union([finite, z.array(finite).max(16)]);
const shape = z.union([z.object({ kind: z.literal("scalar") }), z.object({ kind: z.literal("tuple"), arity: z.number().int().min(1).max(16) })]);
const badge = z.object({ id: z.string().max(64), emoji: z.string().max(16), label: z.string().max(128), kid: z.string().max(300) });
const helper = z.object({
  name: z.object({ python: z.string().max(64), typescript: z.string().max(64) }),
  signature: z.object({ python: z.string().max(300), typescript: z.string().max(300) }),
  kid: z.string().max(500), class: z.string().max(64).optional(), group: z.enum(["read", "mutator"]),
});
/** The fully applied object type of the game (game-types InstanceInfo): its display tables, mutators and prelude helpers. */
export const instanceSchema = z.object({
  objectType: z.string().max(32), key: z.string().max(128), label: z.string().max(300),
  args: z.record(z.string(), z.union([finite, z.string().max(64)])),
  badges: z.array(badge).max(32), terms: z.record(z.string(), finite),
  display: z.record(z.string(), z.unknown()),
  codec: z.object({ format: z.string().max(64), maxLength: z.number().int().nonnegative() }),
  mutators: z.array(z.object({ id: z.string().max(64), name: z.string().max(128), emoji: z.string().max(16), summary: z.string().max(500) })).max(64),
  helpers: z.array(helper).max(128),
});
export type InstanceView = z.infer<typeof instanceSchema>;
/** Your kid card: plain-language incentives, then `def utility(...)` source in the game's default language; a defence goal adds `penalty`. */
export const utilityCardSchema = z.object({
  familyId: z.string().max(128), emoji: z.string().max(16), name: z.string().max(128), theme: z.string().max(500),
  summary: z.string().max(2000), language, source: z.string().max(16384), shape: shape.optional(),
  // A tiny example board of the goal (docs/rules-design.md §3.2): a grid wire value of its own size and a caption.
  example: z.object({ value: z.string().max(256), size: z.number().int().min(1).max(4), caption: z.string().max(300) }).optional(),
  penalty: z.object({
    familyId: z.string().max(128), emoji: z.string().max(16), name: z.string().max(128), summary: z.string().max(2000),
    comparative: z.string().max(64), source: z.string().max(16384), shape: shape.optional(),
  }).optional(),
});
export type UtilityCardView = z.infer<typeof utilityCardSchema>;
/** Estimated energy bits per act, split (docs/energy-model.md §5): what its reads cost (bits read / changeReadRatio) and its change. No fixed part. */
const breakdownSchema = z.object({ read: finite, change: finite });
/** One allowed language's agent sandbox: booted (`ready`), booting (`warming`), or not booting (`failed`, with why). */
export const sandboxSchema = z.object({ language, state: z.enum(["warming", "ready", "failed"]), reason: z.string().max(500).optional() });
export type SandboxStatus = z.infer<typeof sandboxSchema>;
/**
 * How long the engine lets one player's validate or summon examine an agent in the sandbox before it answers
 * UNAVAILABLE with nothing applied (engine convex/commands.ts). A healthy examination takes a few seconds (a few
 * hundred runs of a few milliseconds, four at a time); only a congested sandbox queue, where each run may wait up to
 * 34 s, takes longer. Clients wait a little longer than this, so the engine's answer normally comes first.
 */
export const EXAMINATION_DEADLINE_MS = 20_000;
export const sandboxNotReadySchema = z.object({ language, state: z.enum(["warming", "failed"]), reason: z.string().max(500).optional(), retryAfterMs: z.number().int().nonnegative() });
// Strip unknown fields at every level: never spread raw server state into model context.
export const observationSchema = z.object({
  version: z.literal(VERSION), roomId: id, revision: z.number().int().nonnegative(),
  gameId: id.optional(), planningEndsAt: finite.optional(), pauseEndsAt: finite.optional(),
  phase: z.enum(["lobby", "planning", "running", "paused", "ended"]),
  // Why the game is not advancing on its own, when it is not: its engine retrying a failing tick, an idle park (any
  // signed-in human's activity resumes it), a pause for safety (the owner resumes it), or its end. Absent while it runs.
  notice: z.object({ kind: z.enum(["retrying", "idle", "safety", "ended"]), text: z.string().max(500) }).optional(),
  // Why an ended game ended: it reached its lifetime, or the owner ended it.
  endReason: z.enum(["lifetime", "owner"]).optional(),
  // The languages agents may be written in (each agent picks one; validate/summon carry it), and the default: the first.
  language, languages: z.array(language).min(1).max(LANGUAGES.length),
  // Each allowed language's agent sandbox. Validate and summon in a language wait for `ready` (they answer notReady
  // before); while any is not ready after planning's deadline, planning holds: world time starts for everyone at once.
  sandboxes: z.array(sandboxSchema).max(LANGUAGES.length).optional(),
  // Hold rarity's corrections for this player count (docs/energy-model.md §8), computed during planning: planning holds
  // for them like a sandbox. `failed`: the game scores on static rarity. Absent for one player.
  holdRarity: z.object({ state: z.enum(["computing", "ready", "failed"]), reason: z.string().max(500).optional() }).optional(),
  // `seated` is false for a member who joined after this game launched: they spectate and play in the next one.
  roomShortCode: z.string().max(32).optional(), gameShortCode: z.string().max(32).optional(), seated: z.boolean().optional(),
  instance: instanceSchema.optional(),
  /**
   * The game's energy rules. Each god has powerPerSecond bits per world second (P), split into its agents' powerShare
   * (income = share x P) and the unallocated rest, which is the god's own income and pays summons (it starts with
   * startingEnergy). Every account holds at most its power x fullChargeSeconds (an agent's `capacity`, self.capacity):
   * energy fills up in that many seconds and then stops, and income past a full store is lost (absent: a game from before
   * capacities, which has none). Each opportunity goes to an agent with probability proportional to its positive energy: one draw
   * over every agent in the room, so a god's turns follow the energy its agents hold together, however many they are
   * (maxAgentOpportunityHz appears only on replays of games from before 11 Nov 2026, which limited each agent's turns
   * per world second); an act pays the bits it read divided by changeReadRatio,
   * plus its change when it changes the object (docs/energy-model.md §2). changeReadRatio (κ, absent on replays of
   * older games) is how many bits an agent may read for the price of one bit of change: looking is κ× cheaper.
   */
  economy: z.object({ powerPerSecond: finite, startingEnergy: finite, fullChargeSeconds: finite.optional(), maxAgentOpportunityHz: finite.optional(), changeReadRatio: finite.optional(),
    maxAgentsPerGod: z.number().int().nonnegative(), penaltyWeight: finite, worldSeconds: finite,
    /** How the game ends and its length in world seconds (the exact length when "fixed", else the half-life): the game timer. */
    durationMode: z.enum(["fixed", "halfLife"]).optional(), lengthSeconds: finite.optional(),
    commitClause: z.boolean().optional(), objectSelection: z.enum(["uniform", "shelter"]).optional() }).optional(),
  self: z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), energy: finite, ready: z.boolean(), pauseUsed: z.boolean().optional(),
    // Power: the share (0–1) of economy.powerPerSecond given to your agents, and your own income (bits per world second) from the rest.
    // capacity: the most your own energy can hold, income x economy.fullChargeSeconds (absent: no capacity).
    allocated: finite.optional(), income: finite.optional(), capacity: finite.optional(),
    utility: utilityCardSchema.optional(),
    // Your own total payoff NOW (live), while the leaderboard is the scoreboard last published (leaderboardWorldSeconds).
    score: finite.optional() }),
  // Your own score of each object and aggregates over your peers. Individual opponents' scores are never disclosed.
  objects: z.array(z.object({ id, value: wire,
    own: z.object({ ordinal, rewardBits: finite, penaltyBits: finite.optional(), netBits: finite }),
    peerNetBits: finite, peerCare: finite, payoff: finite })).max(2000),
  // Your agents. `eligible`: it can be offered the next opportunity now (positive energy); the
  // more energy, the likelier. expectedActCost is the summon-time estimate per act (reading + changing); nothing is
  // charged from it. `skips`: acts that returned no calls (they paid only what they read; not failures).
  agents: z.array(z.object({ id, name: agentName, description: agentDescription.optional(), source: z.string().max(16384), language: storedLanguage, summonCost: finite, expectedActCost: finite,
    breakdown: breakdownSchema, randomized: z.boolean(),
    energy: finite, eligible: z.boolean(),
    // Its share (0–1) of your power and its income: share x economy.powerPerSecond bits per world second.
    // capacity: the most energy it can hold, income x economy.fullChargeSeconds; a full store wastes its income (absent: none).
    powerShare: finite.optional(), income: finite.optional(), capacity: finite.optional(), acts: z.number().int().nonnegative(), spent: finite, skips: z.number().int().nonnegative().optional(),
    // Of `spent`: the energy its acts paid for reading (bits read / economy.changeReadRatio; the rest paid for the changes they made).
    spentRead: finite.optional(),
    // How its acts ended (counted since the engine started counting: older agents' earlier acts are not in it): changed
    // the object, or failed by kind (collision: another object already had the value; noChange; commit: the commit
    // clause kept the object; invalid call; error: the code raised or timed out), with the last invalid call or error.
    outcomes: z.object({ transforms: z.number().int().nonnegative(),
      failures: z.object({ collision: count, noChange: count, commit: count, invalid: count, error: count, unaffordable: count.optional() }),
      lastFailures: z.object({ invalid: z.string().max(300).optional(), error: z.string().max(300).optional() }).optional() }).optional(),
    // "38 of 38 acts failed: another object already has this value", and when most acts fail, why and how to fix it.
    diagnosis: z.object({ summary: z.string().max(500), hint: z.string().max(600).optional() }).optional() })).max(200),
  transformations: z.array(z.object({ id, agentId: id, before: wire, after: wire,
    calls: z.array(z.tuple([z.string().max(64), z.record(z.string(), z.unknown())])).max(16).optional(), cost: finite.optional() })).max(500),
  // Every god's total payoff as last published: it changes for everyone at once every settings.scoreIntervalSeconds of
  // world time (docs/public-log-design.md §3), at world time leaderboardWorldSeconds.
  leaderboard: z.array(z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), totalPayoff: finite })).max(100),
  leaderboardWorldSeconds: finite.optional(),
  chat: z.array(z.object({ id, godId: id, label: z.string().max(128), isAI: z.boolean(), text: z.string().max(2000) })).max(100),
});
export type Observation = z.infer<typeof observationSchema>;
export const resultSchema = z.object({
  commandId: z.string().uuid(), accepted: z.boolean(),
  message: z.string().max(2000),
  // cost: the summon price (description bits, by part), paid once. Every act then pays only what it does: the bits it
  // reads, plus its change when it changes the object (expectedActCost estimates it; breakdown splits it).
  validation: z.object({ valid: z.boolean(), cost: finite.nonnegative(), expectedActCost: finite.nonnegative(),
    parts: z.object({ structure: finite, names: finite, literals: finite, moveFlags: finite, literalMoves: finite, commitClause: finite.optional() }).optional(),
    breakdown: breakdownSchema.optional(), randomized: z.boolean().optional(),
    // Measured on the reference objects: the share of acts that change the object, that fail or are invalid, and that skip.
    changeRate: finite.min(0).max(1).optional(), invalidRate: finite.min(0).max(1).optional(), skipRate: finite.min(0).max(1).optional(),
    // Two passes over a sample world (the game's objects first; docs/rules-design.md §11): the share of acts that
    // succeed, and why the rest would fail: one result for every object (constant), nothing more on a second application
    // (idempotent), or no change at all (identity). Constant and idempotent are claims about a deterministic agent only.
    expectedSuccessRate: finite.min(0).max(1).optional(),
    futility: z.object({ deterministic: z.boolean(), constant: z.boolean(), idempotent: z.boolean(), identity: z.boolean(),
      firstPass: finite.min(0).max(1), secondPass: finite.min(0).max(1), successRate: finite.min(0).max(1) }).optional(),
    // One line each for the player, shown before the summon; a summon is never refused for them.
    warnings: z.array(z.string().max(500)).max(8).optional(),
    // The validating god's energy when it was measured, and whether it covers the summon price.
    energy: finite.optional(), affordable: z.boolean().optional(),
    diagnostics: z.array(z.string().max(1000)).max(30) }).optional(),
  // A summon's examination warnings (as validate's): the agent is summoned anyway.
  warnings: z.array(z.string().max(500)).max(8).optional(),
  // Validate or summon before the agent's language's sandbox is warm: nothing was examined or stored, and the identical
  // command can be sent again after retryAfterMs. `failed` carries the boot's reason (it is retried automatically).
  notReady: sandboxNotReadySchema.optional(),
});
export type CommandResult = z.infer<typeof resultSchema>;
/** Room-credential permissions, weakest first: read < act < owner. */
export const permissionSchema = z.enum(["read", "act", "owner"]);
export type Permission = z.infer<typeof permissionSchema>;
/** The room assistant's `room-command` (engine `owner.command`): owner credential (or browser owner) only. */
export const ownerActionSchema = z.object({
  action: z.enum(["settings", "quotas", "start", "resume", "endGame", "addAi", "removeAi"]),
  requestId: z.string().uuid(),
  revision: z.number().int().nonnegative().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  setupId: z.string().max(128).optional(),
  aiQuota: z.number().int().min(0).max(1000000).optional(),
  assistantQuota: z.number().int().min(0).max(2000000).optional(),
  assistantModel: z.string().max(64).optional(),
  aiAgentId: z.string().max(128).optional(),
  deityId: z.string().max(128).optional(),
}).strict();
export type OwnerAction = z.infer<typeof ownerActionSchema>;
/** What an AI seat or other driver needs from the engine: its observation, and a v3 envelope → its receipt. */
export interface PlayerTransport {
  observe(signal?: AbortSignal): Promise<Observation>;
  send(envelope: Envelope, signal?: AbortSignal): Promise<CommandResult>;
}
