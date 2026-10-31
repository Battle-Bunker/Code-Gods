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

/** The engine stores the public catalog untyped (`catalogs.catalog`); entries follow object-views' shape. */
export type UtilityFamily = CatalogEntry & { available?: boolean };
export const catalogOf = (catalog: unknown): UtilityFamily[] => (Array.isArray(catalog) ? catalog as UtilityFamily[] : []);

/** `manifest.get` returns its object types untyped; this is their shape (convex/manifest.ts). */
export interface OfferedInfo extends OfferedLike { settingsDefaults?: Record<string, unknown> }
export interface ObjectTypeInfo extends ObjectTypeInfoLike<OfferedInfo> {
  label: string; emoji: string; kid: string;
  settingsDefaults?: Record<string, unknown>;
  classes: { id: string; slot: string; superclasses?: string[]; badge: { id: string; emoji: string; label: string; kid: string } }[];
}
export type SettingsOptions = typeof SETTINGS_OPTIONS;
export interface SettingsPreset { id: string; label: string; kid: string; objectType: string; typeArgs: Record<string, number | string>; offered: boolean }
export interface Manifest {
  protocolVersion: number; playerProtocol: string; minimumPlayers: number; maximumPlayers: number;
  defaults: Settings; runtimes: string[]; options: SettingsOptions; objectTypes: ObjectTypeInfo[]; presets: SettingsPreset[];
  aiFunding: { provider: string; model: string; billing: string; mock: boolean; configured: boolean; live: boolean;
    /** The vetted model catalog (ids, labels, whether this deployment has the provider key). */
    models?: { id: string; label: string; provider: string; configured: boolean }[] };
}
