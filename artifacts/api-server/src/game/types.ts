import type { GameSettings, ObjectValue } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
export type AISeatDefinition = { id: string; name: string; provider: "anthropic" | "openai"; model: string; prompt: string; revision: number };
export type Member = { id: string; name: string; kind: "human" | "ai"; ready: boolean; status?: string; aiAgent?: AISeatDefinition };
export type Chat = { id: string; authorId: string; authorName: string; kind: string; text: string; timestamp: number };
/** `utilities` is server-private: each god's utility for this object. Only aggregates leave the server. */
export type WorldObject = {
  id: string; value: ObjectValue; version: number; utilities: Record<string, number>;
  /** Grid only, server-private: what each god's utility function makes of this object. Only its owner sees an entry. */
  rarity?: Record<string, GridRarity>;
};
/** One god's reading of one grid: reward surprisal and, with a defence goal, the badness surprisal and penalty bits. */
export type GridRarity = { bits: number; penaltySurprisal: number | null; penaltyBits: number | null };
/**
 * Grid agents have their own energy account (bits), separate from their god's: it earns
 * agentEnergyPerSecond of world time, capped at agentBatteryActs × the expected cost of one act.
 * An agent may act only while its balance covers its expected cost; each act's actual cost is
 * deducted and the balance may go negative (a cooldown).
 */
export type AgentEnergy = { balance: number; settledAtWorld: number; expectedCost: number; acts: number; charged: number };
export type Agent = { id: string; ownerId: string; source: string; cost: number; createdAt: number; energy?: AgentEnergy };
export type Deity = { id: string; utility: UtilityDescriptor; spent: number; pauseUsed: boolean };
export type WorldEvent = {
  id: string; gameId: string; type: "object.transformed" | "object.spawned"; timestamp: number;
  object: WorldObject; agentId?: string; ownerId?: string; before?: ObjectValue;
  /** Grid transformations: the mutator steps applied (kid-readable) and their total cost in bits. */
  steps?: string[]; bits?: number;
};
export type Game = {
  id: string; shortCode: string; phase: "planning" | "running" | "paused" | "recovery" | "ended";
  // Snapshot includes interactionComputeMs; changing lobby settings cannot change this budget.
  settings: GameSettings; roster: Member[]; deities: Deity[]; objects: WorldObject[]; agents: Agent[];
  createdAt: number; planningEndsAt: number; pauseEndsAt: number; worldSeconds: number;
  endAtWorld: number; nextSpawn: number; nextInteraction: number; lastTick: number;
  events: WorldEvent[]; recoveryReason?: string; executionEpoch?: number;
  /** Recovery caused by a restart or idling resumes by itself once a human is active again. */
  autoResume?: boolean;
  /** Wall-clock end. Null for legacy games that ended before this was recorded. */
  endedAt?: number | null;
  endReason?: GameEndReason;
};
export type GameEndReason = "lifetime" | "owner" | "retired";
/**
 * A room is a persistent lobby: members, readiness and the owner's settings draft
 * for the NEXT game. `game` is the room's current game slot: the active game, or the
 * most recent one until the next launch. Each game is also stored on its own in
 * cg_games, where its public result becomes the room's history once it ends.
 */
export type Room = {
  id: string; shortCode: string; ownerId: string; createdAt: number | null; revision: number;
  settings: GameSettings; members: Member[]; chat: Chat[]; game: Game | null;
  aiBudget: number; aiUsed: number; receipts: Record<string, { hash: string; result: unknown }>;
  aiReservedUsd: number; aiDaily: { day: string; usd: number; calls: number[] };
  aiInputTokens?: number; aiOutputTokens?: number;
  seq: number;
};
export type Actor = { id: string; name: string; kind: "human" | "ai"; scope: "browser" | "player"; roomId?: string;
  delegateId?: string; clientLabel?: string; permission?: "read" | "act" | "owner"; expiresAt?: string; sessionHash?: string };
