import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { agentTables } from "./agent/tables";
import { authTables } from "./auth/tables";
import { gameTables } from "./game/tables";
import { runtimeTables } from "./runtime/tables";
import { calibrationTables } from "./calibration/tables";
import { panelTables } from "./panels/tables";
import { assistantTables } from "./assistant/tables";
import { layoutTables } from "./layout/tables";
import { codeTables } from "./code/tables";

/** A deployed site: the engine UI, the player client, or the functions (convex/version.ts). */
export const versionSiteV = v.union(v.literal("engine"), v.literal("player"), v.literal("functions"));
/** The deployed builds per site, one row per deploy (owned by convex/version.ts). */
const versionTables = {
  siteBuilds: defineTable({ site: versionSiteV, build: v.string(), deployedAt: v.number() })
    .index("by_site", ["site", "deployedAt"]).index("by_site_build", ["site", "build"]),
};

/** One schema, several owners: auth/tables.ts (identity, devices, credentials), game/tables.ts, runtime/tables.ts, calibration/tables.ts, agent/tables.ts (MCP OAuth, jobs) panels/tables.ts, assistant/tables.ts, layout/tables.ts, code/tables.ts and versionTables above. */
export default defineSchema({ ...authTables, ...gameTables, ...runtimeTables, ...calibrationTables, ...agentTables, ...panelTables, ...assistantTables, ...layoutTables, ...codeTables, ...versionTables });
