import { defineSchema } from "convex/server";
import { agentTables } from "./agent/tables";
import { authTables } from "./auth/tables";
import { gameTables } from "./game/tables";
import { runtimeTables } from "./runtime/tables";
import { calibrationTables } from "./calibration/tables";
import { panelTables } from "./panels/tables";
import { assistantTables } from "./assistant/tables";
import { layoutTables } from "./layout/tables";

/** One schema, several owners: auth/tables.ts (identity, devices, credentials), game/tables.ts, runtime/tables.ts, calibration/tables.ts, agent/tables.ts (MCP OAuth, jobs) panels/tables.ts, assistant/tables.ts and layout/tables.ts. */
export default defineSchema({ ...authTables, ...gameTables, ...runtimeTables, ...calibrationTables, ...agentTables, ...panelTables, ...assistantTables, ...layoutTables });
