import { defineSchema } from "convex/server";
import { authTables } from "./auth/tables";
import { gameTables } from "./game/tables";
import { runtimeTables } from "./runtime/tables";
import { panelTables } from "./panels/tables";

/** One schema, several owners: auth/tables.ts (identity, sessions, devices, credentials), game/tables.ts, runtime/tables.ts and panels/tables.ts. */
export default defineSchema({ ...authTables, ...gameTables, ...runtimeTables, ...panelTables });
