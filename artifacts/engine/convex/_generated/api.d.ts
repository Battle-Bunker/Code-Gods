/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth_access from "../auth/access.js";
import type * as auth_config from "../auth/config.js";
import type * as auth_credentials from "../auth/credentials.js";
import type * as auth_crypto from "../auth/crypto.js";
import type * as auth_device from "../auth/device.js";
import type * as auth_jwt from "../auth/jwt.js";
import type * as auth_oidc from "../auth/oidc.js";
import type * as auth_profileName from "../auth/profileName.js";
import type * as auth_rooms from "../auth/rooms.js";
import type * as auth_routes from "../auth/routes.js";
import type * as auth_sessions from "../auth/sessions.js";
import type * as auth_tables from "../auth/tables.js";
import type * as auth_testing from "../auth/testing.js";
import type * as auth_user from "../auth/user.js";
import type * as game_tables from "../game/tables.js";
import type * as http from "../http.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "auth/access": typeof auth_access;
  "auth/config": typeof auth_config;
  "auth/credentials": typeof auth_credentials;
  "auth/crypto": typeof auth_crypto;
  "auth/device": typeof auth_device;
  "auth/jwt": typeof auth_jwt;
  "auth/oidc": typeof auth_oidc;
  "auth/profileName": typeof auth_profileName;
  "auth/rooms": typeof auth_rooms;
  "auth/routes": typeof auth_routes;
  "auth/sessions": typeof auth_sessions;
  "auth/tables": typeof auth_tables;
  "auth/testing": typeof auth_testing;
  "auth/user": typeof auth_user;
  "game/tables": typeof game_tables;
  http: typeof http;
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
};
