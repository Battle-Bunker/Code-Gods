import type { AgentAccount, GameSettings, ObjectValue } from "@workspace/game-core";
import type { MutatorCallWire } from "@workspace/game-types";
import type { GodScore, UtilityDescriptor } from "@workspace/game-utilities";
export type AISeatDefinition = { id: string; name: string; provider: "anthropic" | "openai"; model: string; prompt: string; revision: number };
export type Member = { id: string; name: string; kind: "human" | "ai"; ready: boolean; status?: string; aiAgent?: AISeatDefinition };
export type Chat = { id: string; authorId: string; authorName: string; kind: string; text: string; timestamp: number };
/** `scores` is server-private: each god's evaluation of this object. Only the god's own and aggregates leave the server. */
export type WorldObject = { id: string; value: ObjectValue; version: number; scores: Record<string, GodScore> };
/**
 * A summoned agent. `summonCost` (description bits) was paid once from god energy; the agent has its own
 * account (world-time income, capped battery) and is eligible while energy ≥ `expectedActCost`.
 */
export type Agent = {
  id: string; ownerId: string; source: string; createdAt: number;
  /** Description bits paid by the god. */
  summonCost: number;
  /** Measured I(X; A), charged on every act; perActFloorBits is added to every act too (the game's setting at summon). */
  decisionBits: number; perActFloorBits: number;
  /** The measured expected charge per act (= breakdown summed) and whether the agent uses random. */
  expectedActCost: number; breakdown: { decision: number; erasure: number; motion: number; floor: number }; randomized: boolean;
  account: AgentAccount;
  /** Acts attempted and committed (successful or not), and the bits they cost in total. */
  acts: number; spent: number;
};
/** What one act cost the agent; `naming` (the calls' own naming bits) is reported, not charged. */
export type ActCharge = { decision: number; erasure: number; motion: number; floor: number; total: number; naming: number };
/** The persisted result of one act for the agent: absolute values, so replay can restore the account. */
export type AgentActState = { id: string; account: AgentAccount; acts: number; spent: number };
export type Deity = { id: string; utility: UtilityDescriptor; spent: number; pauseUsed: boolean };
export type WorldEvent =
  | {
    id: string; gameId: string; type: "object.spawned"; timestamp: number; object: WorldObject;
  }
  | {
    id: string; gameId: string; type: "object.transformed"; timestamp: number; object: WorldObject;
    agentId: string; ownerId: string; before: ObjectValue;
    calls?: readonly MutatorCallWire[]; cost?: ActCharge; agent?: AgentActState;
  }
  | {
    /** An act that changed nothing (runtime error, invalid calls, no change, or a duplicate value): it still paid. */
    id: string; gameId: string; type: "agent.failed"; timestamp: number; objectId: string;
    agentId: string; ownerId: string; reason: string; cost: ActCharge; agent: AgentActState;
  };
export type Game = {
  id: string; shortCode: string; phase: "planning" | "running" | "paused" | "recovery" | "ended";
  /** Marks a game of this design; stored games without it are never read. */
  scoring: "information-v1";
  /** sha256 of the season salt behind this game's seeds (revealed after the season). */
  seasonCommitment: string;
  // Snapshot includes interactionComputeMs; changing lobby settings cannot change this budget.
  settings: GameSettings; roster: Member[]; deities: Deity[]; objects: WorldObject[]; agents: Agent[];
  createdAt: number; planningEndsAt: number; pauseEndsAt: number; worldSeconds: number;
  endAtWorld: number; nextSpawn: number; lastTick: number;
  events: WorldEvent[]; recoveryReason?: string; executionEpoch?: number;
  /** Recovery caused by a restart or idling resumes by itself once a human is active again. */
  autoResume?: boolean;
  /** Wall-clock end, stamped in the commit that ends the game. */
  endedAt?: number;
  endReason?: GameEndReason;
};
export type GameEndReason = "lifetime" | "owner";
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
