import { defineSchema } from "convex/server";
import { agentTables } from "./agent/tables";
import { authTables } from "./auth/tables";
import { gameTables } from "./game/tables";
import { runtimeTables } from "./runtime/tables";

/** One schema, several owners: auth/tables.ts (identity, sessions, devices, credentials), game/tables.ts, runtime/tables.ts and agent/tables.ts (MCP OAuth, jobs). */
export default defineSchema({ ...authTables, ...gameTables, ...runtimeTables, ...agentTables });
