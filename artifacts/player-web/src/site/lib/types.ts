/** UI types, derived from the engine's Convex functions (the contract) where the engine types them. */
import type { FunctionReturnType } from "convex/server";
import type { GameSettings, SETTINGS_OPTIONS } from "@workspace/game-core";
import type { InstanceInfo as EngineInstanceInfo } from "@workspace/game-types";
import type { ObjectTypeInfoLike, OfferedLike } from "@workspace/object-views";
import type { CatalogEntry } from "@workspace/game-utilities";
import type { api } from "@/site/lib/convex-api";

export type Settings = GameSettings;
export type InstanceInfo = EngineInstanceInfo;
export type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
export type RoomListRow = FunctionReturnType<typeof api.rooms.list>[number];
/** A game's cold header (games.header): what the game page routes on and its header shows. */
export type GameHeader = FunctionReturnType<typeof api.games.header>;
/** What a page passes the layout of its game: the header and, once loaded, the game's object type (games.instance). */
export type GameView = GameHeader & { objectInstance?: InstanceInfo };
/** rooms.history rows are stored game summaries (`gameRecord` in the engine's projection). */
export type { GameRecord } from "@workspace/engine/convex/lib/projection";
export type ChatMessage = RoomState["chat"][number];
export type RosterEntry = GameHeader["roster"][number];
export type Standing = FunctionReturnType<typeof api.games.standings>["rows"][number];
export type Credential = FunctionReturnType<typeof api.auth.credentials.list>[number];
export type DeviceRequest = NonNullable<FunctionReturnType<typeof api.auth.device.pending>>;
export type AdminAgents = FunctionReturnType<typeof api.aiTemplates.adminList>;
export type AiAgent = AdminAgents["agents"][number];
export type AiModel = AdminAgents["models"][number];
/** A setup as a page of the shared catalogue lists it (setups.page): no owner, no settings. */
export type SetupEntry = FunctionReturnType<typeof api.setups.page>["page"][number];
/** One setup as a list row shows it, with its owner (setups.row): no settings; `SetupFull` (setups.get) has them. */
export type Setup = NonNullable<FunctionReturnType<typeof api.setups.row>>;
export type SetupFull = FunctionReturnType<typeof api.setups.get>;

/** The engine stores the public catalog untyped (`catalogs.catalog`); entries follow object-views' shape. */
export type UtilityFamily = CatalogEntry & { available?: boolean };
export const catalogOf = (catalog: unknown): UtilityFamily[] => (Array.isArray(catalog) ? catalog as UtilityFamily[] : []);

/** `manifest.get` returns its object types untyped; this is their shape (convex/manifest.ts). */
export type OfferedInfo = OfferedLike;
/** A playable shape (manifest.get `playable`): its first game's preparation here, and whether synergy is measured. */
export type PlayableInfo = OfferedInfo & { prepare: { toCompute: number; seconds: number } | null; synergy: string[] };
export interface ObjectTypeInfo extends Omit<ObjectTypeInfoLike<OfferedInfo>, "offered"> {
  /** Every shape a room may choose (tables are prepared on demand); one whose tables are all shipped has `prepare: null`. */
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
    models?: { id: string; label: string; provider: string; configured: boolean; inputUsdPerMillion?: number; outputUsdPerMillion?: number }[]; quotas?: { aiDefault: number; aiMax: number; assistantDefault: number; assistantMax: number } };
}
