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
import type * as agent_bound from "../agent/bound.js";
import type * as agent_connect from "../agent/connect.js";
import type * as agent_mcp from "../agent/mcp.js";
import type * as agent_node from "../agent/node.js";
import type * as agent_oauth from "../agent/oauth.js";
import type * as agent_oauthStore from "../agent/oauthStore.js";
import type * as agent_registry from "../agent/registry.js";
import type * as agent_rules from "../agent/rules.js";
import type * as agent_store from "../agent/store.js";
import type * as agent_tables from "../agent/tables.js";
import type * as ai_seats from "../ai/seats.js";
import type * as ai_turn from "../ai/turn.js";
import type * as aiTemplates from "../aiTemplates.js";
import type * as assistant from "../assistant.js";
import type * as assistant_rules from "../assistant/rules.js";
import type * as assistant_step from "../assistant/step.js";
import type * as assistant_store from "../assistant/store.js";
import type * as assistant_tables from "../assistant/tables.js";
import type * as auth_access from "../auth/access.js";
import type * as auth_betterAuth from "../auth/betterAuth.js";
import type * as auth_config from "../auth/config.js";
import type * as auth_credentials from "../auth/credentials.js";
import type * as auth_crypto from "../auth/crypto.js";
import type * as auth_device from "../auth/device.js";
import type * as auth_identity from "../auth/identity.js";
import type * as auth_jwt from "../auth/jwt.js";
import type * as auth_principal from "../auth/principal.js";
import type * as auth_profileName from "../auth/profileName.js";
import type * as auth_rooms from "../auth/rooms.js";
import type * as auth_routes from "../auth/routes.js";
import type * as auth_tables from "../auth/tables.js";
import type * as auth_testing from "../auth/testing.js";
import type * as auth_user from "../auth/user.js";
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
import type * as http from "../http.js";
import type * as layout from "../layout.js";
import type * as layout_tables from "../layout/tables.js";
import type * as lib_aiModels from "../lib/aiModels.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_load from "../lib/load.js";
import type * as lib_projection from "../lib/projection.js";
import type * as lib_rooms from "../lib/rooms.js";
import type * as lib_world from "../lib/world.js";
import type * as manifest from "../manifest.js";
import type * as owner from "../owner.js";
import type * as panels from "../panels.js";
import type * as panels_access from "../panels/access.js";
import type * as panels_compile from "../panels/compile.js";
import type * as panels_compiler from "../panels/compiler.js";
import type * as panels_limits from "../panels/limits.js";
import type * as panels_tables from "../panels/tables.js";
import type * as panels_testing from "../panels/testing.js";
import type * as player from "../player.js";
import type * as receipts from "../receipts.js";
import type * as rooms from "../rooms.js";
import type * as runtime_assets from "../runtime/assets.js";
import type * as runtime_node from "../runtime/node.js";
import type * as runtime_probe from "../runtime/probe.js";
import type * as runtime_tables from "../runtime/tables.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  "agent/bound": typeof agent_bound;
  "agent/connect": typeof agent_connect;
  "agent/mcp": typeof agent_mcp;
  "agent/node": typeof agent_node;
  "agent/oauth": typeof agent_oauth;
  "agent/oauthStore": typeof agent_oauthStore;
  "agent/registry": typeof agent_registry;
  "agent/rules": typeof agent_rules;
  "agent/store": typeof agent_store;
  "agent/tables": typeof agent_tables;
  "ai/seats": typeof ai_seats;
  "ai/turn": typeof ai_turn;
  aiTemplates: typeof aiTemplates;
  assistant: typeof assistant;
  "assistant/rules": typeof assistant_rules;
  "assistant/step": typeof assistant_step;
  "assistant/store": typeof assistant_store;
  "assistant/tables": typeof assistant_tables;
  "auth/access": typeof auth_access;
  "auth/betterAuth": typeof auth_betterAuth;
  "auth/config": typeof auth_config;
  "auth/credentials": typeof auth_credentials;
  "auth/crypto": typeof auth_crypto;
  "auth/device": typeof auth_device;
  "auth/identity": typeof auth_identity;
  "auth/jwt": typeof auth_jwt;
  "auth/principal": typeof auth_principal;
  "auth/profileName": typeof auth_profileName;
  "auth/rooms": typeof auth_rooms;
  "auth/routes": typeof auth_routes;
  "auth/tables": typeof auth_tables;
  "auth/testing": typeof auth_testing;
  "auth/user": typeof auth_user;
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
  http: typeof http;
  layout: typeof layout;
  "layout/tables": typeof layout_tables;
  "lib/aiModels": typeof lib_aiModels;
  "lib/errors": typeof lib_errors;
  "lib/http": typeof lib_http;
  "lib/load": typeof lib_load;
  "lib/projection": typeof lib_projection;
  "lib/rooms": typeof lib_rooms;
  "lib/world": typeof lib_world;
  manifest: typeof manifest;
  owner: typeof owner;
  panels: typeof panels;
  "panels/access": typeof panels_access;
  "panels/compile": typeof panels_compile;
  "panels/compiler": typeof panels_compiler;
  "panels/limits": typeof panels_limits;
  "panels/tables": typeof panels_tables;
  "panels/testing": typeof panels_testing;
  player: typeof player;
  receipts: typeof receipts;
  rooms: typeof rooms;
  "runtime/assets": typeof runtime_assets;
  "runtime/node": typeof runtime_node;
  "runtime/probe": typeof runtime_probe;
  "runtime/tables": typeof runtime_tables;
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

export declare const components: {
  engineSite: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"engineSite">;
  playerSite: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"playerSite">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
