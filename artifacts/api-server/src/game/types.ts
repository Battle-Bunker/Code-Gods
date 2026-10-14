import type { GameSettings, ObjectValue } from "@workspace/game-core";
export type AISeatDefinition = { id: string; name: string; provider: "anthropic" | "openai"; model: string; prompt: string; revision: number };
export type Member = { id: string; name: string; kind: "human" | "ai"; ready: boolean; status?: string; aiAgent?: AISeatDefinition };
export type Chat = { id: string; authorId: string; authorName: string; kind: string; text: string; timestamp: number };
export type WorldObject = { id: string; value: ObjectValue; version: number; values: Record<string, number> };
export type Agent = { id: string; ownerId: string; source: string; cost: number; createdAt: number };
export type Deity = { id: string; source: string; descriptor: unknown; spent: number; pauseUsed: boolean };
export type WorldEvent = {
  id: string; gameId: string; type: "object.transformed" | "object.spawned"; timestamp: number;
  object: WorldObject; agentId?: string; ownerId?: string; before?: ObjectValue;
};
export type Game = {
  id: string; shortCode: string; phase: "planning" | "running" | "paused" | "recovery" | "ended";
  settings: GameSettings; roster: Member[]; deities: Deity[]; objects: WorldObject[]; agents: Agent[];
  createdAt: number; planningEndsAt: number; pauseEndsAt: number; worldSeconds: number;
  endAtWorld: number; nextSpawn: number; nextInteraction: number; lastTick: number;
  events: WorldEvent[]; recoveryReason?: string;
};
export type Room = {
  id: string; shortCode: string; ownerId: string; createdAt: number | null; revision: number;
  settings: GameSettings; members: Member[]; chat: Chat[]; game: Game | null;
  aiBudget: number; aiUsed: number; receipts: Record<string, { hash: string; result: unknown }>;
  aiReservedUsd: number; aiDaily: { day: string; usd: number; calls: number[] };
  seq: number;
};
export type Actor = { id: string; name: string; kind: "human" | "ai"; scope: "browser" | "player"; roomId?: string };
