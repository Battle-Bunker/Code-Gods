import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The stored settings manifest (convex/manifest.ts): what manifest/node.ts computes from the code and the calibration
 * files (object types with their playable shapes, the priors), one row per name ("settings"), as JSON text (params
 * keys are not Convex field names). Rewritten only when it changes: by every deploy and calibration upload
 * (scripts/upload-calibration.mjs) and by manifest.node.warm.
 */
export const manifestTables = {
  manifests: defineTable({ name: v.string(), body: v.string(), updatedAt: v.number() }).index("by_name", ["name"]),
};
