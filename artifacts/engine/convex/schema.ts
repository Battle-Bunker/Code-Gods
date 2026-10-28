import { defineSchema } from "convex/server";
import { authTables } from "./auth/tables";
import { gameTables } from "./game/tables";

/** One schema, two owners: auth/tables.ts (identity, sessions, devices, credentials) and game/tables.ts. */
export default defineSchema({ ...authTables, ...gameTables });
