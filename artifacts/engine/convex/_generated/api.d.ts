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
import type * as auth_tables from "../auth/tables.js";
import type * as game_tables from "../game/tables.js";
import type * as runtime_assets from "../runtime/assets.js";
import type * as runtime_node from "../runtime/node.js";
import type * as runtime_probe from "../runtime/probe.js";
import type * as runtime_tables from "../runtime/tables.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "auth/access": typeof auth_access;
  "auth/tables": typeof auth_tables;
  "game/tables": typeof game_tables;
  "runtime/assets": typeof runtime_assets;
  "runtime/node": typeof runtime_node;
  "runtime/probe": typeof runtime_probe;
  "runtime/tables": typeof runtime_tables;
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
