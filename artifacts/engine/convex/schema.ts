import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { agentTables } from "./agent/tables";
import { authTables } from "./auth/tables";
import { v2Tables } from "./v2/tables";

/** A deployed site: the app's static build, or the functions (convex/version.ts). */
export const versionSiteV = v.union(v.literal("app"), v.literal("functions"));
/** The deployed builds per site, one row per deploy (owned by convex/version.ts). */
const versionTables = {
  siteBuilds: defineTable({ site: versionSiteV, build: v.string(), deployedAt: v.number() })
    .index("by_site", ["site", "deployedAt"]).index("by_site_build", ["site", "build"]),
};

/**
 * Infrastructure shared by both engines (integration plan §4.1), with the validator it had: the AI template library
 * (aiTemplates.ts) and the agent runtime's assets (runtime/assets.ts).
 */
const sharedTables = {
  aiTemplates: defineTable({
    templateId: v.string(), name: v.string(), provider: v.union(v.literal("anthropic"), v.literal("openai"), v.literal("builtin")), model: v.string(),
    prompt: v.string(), revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    /** Deleted templates stay as tombstones so seeding never recreates them. */
    deleted: v.boolean(),
  }).index("by_template", ["templateId"]).index("by_deleted", ["deleted"]),
  /** The agent runtime's assets in file storage (the Python bundle; convex/runtime/assets.ts, scripts/upload-runtime.mjs). */
  runtimeAssets: defineTable({
    name: v.string(), sha256: v.string(), storedSha256: v.string(), storageId: v.id("_storage"), size: v.number(), uploadedAt: v.number(),
  }).index("by_name", ["name"]),
};

/**
 * The v1 engine's tables (deleted in D2; integration plan §5.8). Their code is on the branch archive/engine-v1; their
 * stored rows stay until D3, so each table accepts any document and has no indexes (a pure widening of what it was).
 * Nothing on this branch reads or writes them.
 */
const V1_TABLES = [
  "aiUsage", "activity", "runtimeReadiness", "compiledPrograms", "manifests",
  "holdTables", "examinationRuns", "workSlots", "rooms", "roomBids", "gameAuctions", "members", "games", "gameClocks", "gameEngine",
  "standings", "standingsHistory", "agentSamples", "deities", "objects", "objectViews", "knowledgeLog", "godTotals", "agents",
  "futileActs", "tickBatches", "objectEvents", "catalogs", "chat", "examinations", "receipts", "gameSetups",
  "calibrationFiles", "calibrationComputed", "calibrationPieces", "calibrationQuotas", "calibrationWaits",
  "panels", "panelVersions", "panelLayouts", "panelQuotas",
  "assistantThreads", "assistantTurns", "assistantMessages", "assistantToolCalls", "assistantAllowances", "assistantQueue", "assistantPrefs",
  "dockLayouts", "codeRuns", "codeObjects", "codeObjectUsage", "codeObjectEvents", "agentJobs",
] as const;
const loose = () => defineTable(v.any());
const v1Tables = Object.fromEntries(V1_TABLES.map(name => [name, loose()])) as Record<(typeof V1_TABLES)[number], ReturnType<typeof loose>>;

/** One schema, several owners: auth/tables.ts (identity, devices, credentials), agent/tables.ts (MCP OAuth), v2/tables.ts (engine v2), sharedTables and versionTables above, and the loose v1 tables. */
export default defineSchema({ ...authTables, ...agentTables, ...sharedTables, ...versionTables, ...v1Tables, ...v2Tables });
