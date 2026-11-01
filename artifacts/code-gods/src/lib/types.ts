/** UI types, derived from the engine's Convex functions (the contract) where the engine types them. */
import type { FunctionReturnType } from "convex/server";
import type { GameSettings, SETTINGS_OPTIONS } from "@workspace/game-core";
import type { InstanceInfo as EngineInstanceInfo } from "@workspace/game-types";
import type { ObjectTypeInfoLike, OfferedLike } from "@workspace/object-views";
import type { CatalogEntry } from "@workspace/game-utilities";
import type { api } from "@/lib/convex-api";

export type Settings = GameSettings;
export type InstanceInfo = EngineInstanceInfo;
export type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
export type RoomListRow = FunctionReturnType<typeof api.rooms.list>[number];
export type GameView = FunctionReturnType<typeof api.games.view>;
/** rooms.history rows are stored game summaries (`gameRecord` in the engine's projection). */
export type { GameRecord } from "@workspace/engine/convex/lib/projection";
export type ChatMessage = RoomState["chat"][number];
export type RosterEntry = GameView["roster"][number];
export type Standing = GameView["leaderboard"][number];
export type PublicObject = GameView["objects"][number];
export type Credential = FunctionReturnType<typeof api.auth.credentials.list>[number];
export type DeviceRequest = NonNullable<FunctionReturnType<typeof api.auth.device.pending>>;
export type AdminAgents = FunctionReturnType<typeof api.aiTemplates.adminList>;
export type AiAgent = AdminAgents["agents"][number];
export type AiModel = AdminAgents["models"][number];
/** A row of the shared setup collection (setups.list): no settings; `SetupFull` (setups.get) has them. */
export type Setup = FunctionReturnType<typeof api.setups.list>[number];
export type SetupFull = FunctionReturnType<typeof api.setups.get>;

/** The engine stores the public catalog untyped (`catalogs.catalog`); entries follow object-views' shape. */
export type UtilityFamily = CatalogEntry & { available?: boolean };
export const catalogOf = (catalog: unknown): UtilityFamily[] => (Array.isArray(catalog) ? catalog as UtilityFamily[] : []);

/** `manifest.get` returns its object types untyped; this is their shape (convex/manifest.ts). */
export type OfferedInfo = OfferedLike;
/** A playable shape (manifest.get `playable`): its first game's preparation here, and whether synergy is measured. */
export type PlayableInfo = OfferedInfo & { prepare: { toCompute: number; seconds: number } | null; synergy: boolean };
export interface ObjectTypeInfo extends ObjectTypeInfoLike<OfferedInfo> {
  /** Every shape a room may choose (tables are prepared on demand); `offered` lists those whose tables are all shipped. */
  playable: PlayableInfo[];
  label: string; emoji: string; kid: string;
  classes: { id: string; slot: string; superclasses?: string[]; badge: { id: string; emoji: string; label: string; kid: string } }[];
}
export type SettingsOptions = typeof SETTINGS_OPTIONS;
export interface Manifest {
  protocolVersion: number; playerProtocol: string; minimumPlayers: number; maximumPlayers: number;
  defaults: Settings; runtimes: string[]; options: SettingsOptions; objectTypes: ObjectTypeInfo[];
  /** The rarity priors with shipped calibration tables (ids; game-utilities shippedPriors). */
  priors?: string[];
  aiFunding: { provider: string; model: string; billing: string; mock: boolean; configured: boolean; live: boolean;
    /** The vetted model catalog (ids, labels, whether this deployment has the provider key). */
    models?: { id: string; label: string; provider: string; configured: boolean; inputUsdPerMillion?: number; outputUsdPerMillion?: number }[]; assistantBudgetMax?: number };
}
