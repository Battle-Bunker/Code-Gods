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
import type * as agent_connect from "../agent/connect.js";
import type * as agent_mcp from "../agent/mcp.js";
import type * as agent_oauth from "../agent/oauth.js";
import type * as agent_oauthStore from "../agent/oauthStore.js";
import type * as agent_rules from "../agent/rules.js";
import type * as agent_store from "../agent/store.js";
import type * as agent_tables from "../agent/tables.js";
import type * as aiTemplates from "../aiTemplates.js";
import type * as auth_access from "../auth/access.js";
import type * as auth_betterAuth from "../auth/betterAuth.js";
import type * as auth_config from "../auth/config.js";
import type * as auth_credentials from "../auth/credentials.js";
import type * as auth_crypto from "../auth/crypto.js";
import type * as auth_device from "../auth/device.js";
import type * as auth_identity from "../auth/identity.js";
import type * as auth_jwt from "../auth/jwt.js";
import type * as auth_preview from "../auth/preview.js";
import type * as auth_previewRoutes from "../auth/previewRoutes.js";
import type * as auth_principal from "../auth/principal.js";
import type * as auth_profileName from "../auth/profileName.js";
import type * as auth_rooms from "../auth/rooms.js";
import type * as auth_routes from "../auth/routes.js";
import type * as auth_tables from "../auth/tables.js";
import type * as auth_testing from "../auth/testing.js";
import type * as auth_user from "../auth/user.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_aiModels from "../lib/aiModels.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_http from "../lib/http.js";
import type * as migrations from "../migrations.js";
import type * as v2_access from "../v2/access.js";
import type * as v2_artefacts from "../v2/artefacts.js";
import type * as v2_bids from "../v2/bids.js";
import type * as v2_deal from "../v2/deal.js";
import type * as v2_games from "../v2/games.js";
import type * as v2_layout from "../v2/layout.js";
import type * as v2_lobby from "../v2/lobby.js";
import type * as v2_ops_account from "../v2/ops/account.js";
import type * as v2_ops_agent from "../v2/ops/agent.js";
import type * as v2_ops_agents from "../v2/ops/agents.js";
import type * as v2_ops_bid from "../v2/ops/bid.js";
import type * as v2_ops_chat from "../v2/ops/chat.js";
import type * as v2_ops_define from "../v2/ops/define.js";
import type * as v2_ops_game from "../v2/ops/game.js";
import type * as v2_ops_moves from "../v2/ops/moves.js";
import type * as v2_ops_object from "../v2/ops/object.js";
import type * as v2_ops_objects from "../v2/ops/objects.js";
import type * as v2_ops_paging from "../v2/ops/paging.js";
import type * as v2_ops_pitch from "../v2/ops/pitch.js";
import type * as v2_ops_power from "../v2/ops/power.js";
import type * as v2_ops_rep from "../v2/ops/rep.js";
import type * as v2_ops_room from "../v2/ops/room.js";
import type * as v2_ops_rule from "../v2/ops/rule.js";
import type * as v2_ops_seats from "../v2/ops/seats.js";
import type * as v2_ops_view from "../v2/ops/view.js";
import type * as v2_play from "../v2/play.js";
import type * as v2_presets from "../v2/presets.js";
import type * as v2_replays from "../v2/replays.js";
import type * as v2_rooms from "../v2/rooms.js";
import type * as v2_spectate from "../v2/spectate.js";
import type * as v2_tables from "../v2/tables.js";
import type * as v2_testing from "../v2/testing.js";
import type * as v2_validators from "../v2/validators.js";
import type * as version from "../version.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  "agent/connect": typeof agent_connect;
  "agent/mcp": typeof agent_mcp;
  "agent/oauth": typeof agent_oauth;
  "agent/oauthStore": typeof agent_oauthStore;
  "agent/rules": typeof agent_rules;
  "agent/store": typeof agent_store;
  "agent/tables": typeof agent_tables;
  aiTemplates: typeof aiTemplates;
  "auth/access": typeof auth_access;
  "auth/betterAuth": typeof auth_betterAuth;
  "auth/config": typeof auth_config;
  "auth/credentials": typeof auth_credentials;
  "auth/crypto": typeof auth_crypto;
  "auth/device": typeof auth_device;
  "auth/identity": typeof auth_identity;
  "auth/jwt": typeof auth_jwt;
  "auth/preview": typeof auth_preview;
  "auth/previewRoutes": typeof auth_previewRoutes;
  "auth/principal": typeof auth_principal;
  "auth/profileName": typeof auth_profileName;
  "auth/rooms": typeof auth_rooms;
  "auth/routes": typeof auth_routes;
  "auth/tables": typeof auth_tables;
  "auth/testing": typeof auth_testing;
  "auth/user": typeof auth_user;
  crons: typeof crons;
  http: typeof http;
  "lib/aiModels": typeof lib_aiModels;
  "lib/errors": typeof lib_errors;
  "lib/http": typeof lib_http;
  migrations: typeof migrations;
  "v2/access": typeof v2_access;
  "v2/artefacts": typeof v2_artefacts;
  "v2/bids": typeof v2_bids;
  "v2/deal": typeof v2_deal;
  "v2/games": typeof v2_games;
  "v2/layout": typeof v2_layout;
  "v2/lobby": typeof v2_lobby;
  "v2/ops/account": typeof v2_ops_account;
  "v2/ops/agent": typeof v2_ops_agent;
  "v2/ops/agents": typeof v2_ops_agents;
  "v2/ops/bid": typeof v2_ops_bid;
  "v2/ops/chat": typeof v2_ops_chat;
  "v2/ops/define": typeof v2_ops_define;
  "v2/ops/game": typeof v2_ops_game;
  "v2/ops/moves": typeof v2_ops_moves;
  "v2/ops/object": typeof v2_ops_object;
  "v2/ops/objects": typeof v2_ops_objects;
  "v2/ops/paging": typeof v2_ops_paging;
  "v2/ops/pitch": typeof v2_ops_pitch;
  "v2/ops/power": typeof v2_ops_power;
  "v2/ops/rep": typeof v2_ops_rep;
  "v2/ops/room": typeof v2_ops_room;
  "v2/ops/rule": typeof v2_ops_rule;
  "v2/ops/seats": typeof v2_ops_seats;
  "v2/ops/view": typeof v2_ops_view;
  "v2/play": typeof v2_play;
  "v2/presets": typeof v2_presets;
  "v2/replays": typeof v2_replays;
  "v2/rooms": typeof v2_rooms;
  "v2/spectate": typeof v2_spectate;
  "v2/tables": typeof v2_tables;
  "v2/testing": typeof v2_testing;
  "v2/validators": typeof v2_validators;
  version: typeof version;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
