import { z } from "zod";

export const VERSION = "code-gods.player.v2" as const;
const id = z.string().min(1).max(128);
const finite = z.number().finite();
const program = { language: z.enum(["python", "typescript"]), source: z.string().min(1).max(16384).refine(source=>new TextEncoder().encode(source).length<=16384,"Source exceeds 16384 UTF-8 bytes") };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate"), ...program }).strict(),
  z.object({ type: z.literal("summon"), ...program }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(2000) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const envelopeSchema = z.object({
  version: z.literal(VERSION), commandId: z.string().uuid(), command: commandSchema,
  gameId: id.optional(),
}).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
// Strip unknown fields at every level: never spread raw server state into model context.
export const observationSchema = z.object({
  version: z.literal(VERSION), roomId: id, revision: z.number().int().nonnegative(),
  gameId: id.optional(), planningEndsAt: finite.optional(), pauseEndsAt: finite.optional(),
  phase: z.enum(["lobby", "planning", "running", "paused", "ended"]),
  language: z.enum(["python", "typescript"]),
  self: z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), energy: finite, ready: z.boolean(), pauseUsed: z.boolean().optional(),
    // Your private utility function: a plain-language summary of its incentives, then its source.
    utility: z.object({ name: z.string().max(128), summary: z.string().max(2000), language: z.enum(["python", "typescript"]), source: z.string().max(16384) }).optional() }),
  // score = ownUtility × othersUtilitySum. Individual opponents' utilities are never disclosed.
  objects: z.array(z.object({ id, value: z.union([finite, z.string().max(1024)]), ownUtility: finite, othersUtilitySum: finite, score: finite })).max(2000),
  agents: z.array(z.object({ id, source: z.string().max(16384), language: z.enum(["python", "typescript"]), cost: finite })).max(200),
  transformations: z.array(z.object({ id, agentId: id, before: z.union([finite,z.string().max(1024)]), after: z.union([finite,z.string().max(1024)]) })).max(500),
  leaderboard: z.array(z.object({ godId: id, label: z.string().max(128), isAI: z.boolean(), score: finite })).max(100),
  chat: z.array(z.object({ id, godId: id, label: z.string().max(128), isAI: z.boolean(), text: z.string().max(2000) })).max(100),
});
export type Observation = z.infer<typeof observationSchema>;
export const resultSchema = z.object({
  commandId: z.string().uuid(), accepted: z.boolean(),
  message: z.string().max(2000),
  validation: z.object({ valid: z.boolean(), cost: finite.nonnegative(), diagnostics: z.array(z.string().max(1000)).max(30) }).optional(),
});
export type CommandResult = z.infer<typeof resultSchema>;
export interface PlayerTransport {
  observe(signal?: AbortSignal): Promise<Observation>;
  send(envelope: Envelope, signal?: AbortSignal): Promise<CommandResult>;
}
