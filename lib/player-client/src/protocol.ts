import { z } from "zod";

/**
 * Player protocol v3 (docs/player-client-integration.md has the migration note from v2).
 * v3 carries information scoring (bits, not [0, 1] utilities), agents that return mutator calls with
 * their own energy accounts, the instantiation the room plays (InstanceInfo) and the kid utility card.
 */
export const VERSION = "code-gods.player.v3" as const;
const id = z.string().min(1).max(128);
const finite = z.number().finite();
const language = z.enum(["python", "typescript"]);
const wire = z.union([finite, z.string().max(1024)]);
const program = { language, source: z.string().min(1).max(16384).refine(source=>new TextEncoder().encode(source).length<=16384,"Source exceeds 16384 UTF-8 bytes") };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate"), ...program }).strict(),
  z.object({ type: z.literal("summon"), ...program }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(2000) }).strict(),
  // Gods may destroy their own agents at any time, for free.
  z.object({ type: z.literal("destroy"), agentId: id }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
/** Commands that act on the current game and therefore need its gameId. */
export const GAME_COMMANDS: readonly Command["type"][] = ["validate", "summon", "pause", "destroy"];
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
/** Your kid card: plain-language incentives, then `def utility(...)` source; a defence goal adds `penalty`. */
export const utilityCardSchema = z.object({
  familyId: z.string().max(128), emoji: z.string().max(16), name: z.string().max(128), theme: z.string().max(500),
  summary: z.string().max(2000), language, source: z.string().max(16384), shape: shape.optional(),
  penalty: z.object({
    familyId: z.string().max(128), emoji: z.string().max(16), name: z.string().max(128), summary: z.string().max(2000),
    comparative: z.string().max(64), source: z.string().max(16384), shape: shape.optional(),
  }).optional(),
});
export type UtilityCardView = z.infer<typeof utilityCardSchema>;
// Strip unknown fields at every level: never spread raw server state into model context.
export const observationSchema = z.object({
  version: z.literal(VERSION), roomId: id, revision: z.number().int().nonnegative(),
  gameId: id.optional(), planningEndsAt: finite.optional(), pauseEndsAt: finite.optional(),
  phase: z.enum(["lobby", "planning", "running", "paused", "ended"]),
  language,
  // `seated` is false for a member who joined after this game launched: they spectate and play in the next one.
  roomShortCode: z.string().max(32).optional(), gameShortCode: z.string().max(32).optional(), seated: z.boolean().optional(),
  instance: instanceSchema.optional(),
  /** The game's energy rules. God energy pays summons (real time); each agent earns per world second. */
  economy: z.object({ energyPerSecond: finite, agentEnergyPerSecond: finite, agentBatteryActs: finite,
    maxAgentsPerGod: z.number().int().nonnegative(), penaltyWeight: finite, worldSeconds: finite }).optional(),
  self: z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), energy: finite, ready: z.boolean(), pauseUsed: z.boolean().optional(),
    utility: utilityCardSchema.optional() }),
  // Your own score of each object and aggregates over your peers. Individual opponents' scores are never disclosed.
  objects: z.array(z.object({ id, value: wire,
    own: z.object({ ordinal, rewardBits: finite, penaltyBits: finite.optional(), netBits: finite }),
    peerNetBits: finite, peerCare: finite, payoff: finite })).max(2000),
  // Your agents. An agent acts only while eligible (energy ≥ expectedActCost); a negative energy is a cooldown.
  agents: z.array(z.object({ id, source: z.string().max(16384), language, summonCost: finite, expectedActCost: finite,
    energy: finite, eligible: z.boolean(), acts: z.number().int().nonnegative(), spent: finite })).max(200),
  transformations: z.array(z.object({ id, agentId: id, before: wire, after: wire,
    calls: z.array(z.tuple([z.string().max(64), z.record(z.string(), z.unknown())])).max(16).optional(), cost: finite.optional() })).max(500),
  leaderboard: z.array(z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), totalPayoff: finite })).max(100),
  chat: z.array(z.object({ id, godId: id, label: z.string().max(128), isAI: z.boolean(), text: z.string().max(2000) })).max(100),
});
export type Observation = z.infer<typeof observationSchema>;
export const resultSchema = z.object({
  commandId: z.string().uuid(), accepted: z.boolean(),
  message: z.string().max(2000),
  validation: z.object({ valid: z.boolean(), cost: finite.nonnegative(), expectedActCost: finite.nonnegative(), diagnostics: z.array(z.string().max(1000)).max(30) }).optional(),
});
export type CommandResult = z.infer<typeof resultSchema>;
export interface PlayerTransport {
  observe(signal?: AbortSignal): Promise<Observation>;
  send(envelope: Envelope, signal?: AbortSignal): Promise<CommandResult>;
}
