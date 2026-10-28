/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as ai_seats from "../ai/seats.js";
import type * as ai_turn from "../ai/turn.js";
import type * as aiTemplates from "../aiTemplates.js";
import type * as auth_access from "../auth/access.js";
import type * as auth_tables from "../auth/tables.js";
import type * as commands from "../commands.js";
import type * as crons from "../crons.js";
import type * as engine_loop from "../engine/loop.js";
import type * as engine_node from "../engine/node.js";
import type * as engine_pricing from "../engine/pricing.js";
import type * as engine_runtime from "../engine/runtime.js";
import type * as engine_tick from "../engine/tick.js";
import type * as game_commands from "../game/commands.js";
import type * as game_lobby from "../game/lobby.js";
import type * as game_queries from "../game/queries.js";
import type * as game_tables from "../game/tables.js";
import type * as games from "../games.js";
import type * as lib_aiModels from "../lib/aiModels.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_load from "../lib/load.js";
import type * as lib_projection from "../lib/projection.js";
import type * as lib_rooms from "../lib/rooms.js";
import type * as lib_world from "../lib/world.js";
import type * as manifest from "../manifest.js";
import type * as owner from "../owner.js";
import type * as player from "../player.js";
import type * as receipts from "../receipts.js";
import type * as rooms from "../rooms.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  "ai/seats": typeof ai_seats;
  "ai/turn": typeof ai_turn;
  aiTemplates: typeof aiTemplates;
  "auth/access": typeof auth_access;
  "auth/tables": typeof auth_tables;
  commands: typeof commands;
  crons: typeof crons;
  "engine/loop": typeof engine_loop;
  "engine/node": typeof engine_node;
  "engine/pricing": typeof engine_pricing;
  "engine/runtime": typeof engine_runtime;
  "engine/tick": typeof engine_tick;
  "game/commands": typeof game_commands;
  "game/lobby": typeof game_lobby;
  "game/queries": typeof game_queries;
  "game/tables": typeof game_tables;
  games: typeof games;
  "lib/aiModels": typeof lib_aiModels;
  "lib/errors": typeof lib_errors;
  "lib/load": typeof lib_load;
  "lib/projection": typeof lib_projection;
  "lib/rooms": typeof lib_rooms;
  "lib/world": typeof lib_world;
  manifest: typeof manifest;
  owner: typeof owner;
  player: typeof player;
  receipts: typeof receipts;
  rooms: typeof rooms;
  testing: typeof testing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
