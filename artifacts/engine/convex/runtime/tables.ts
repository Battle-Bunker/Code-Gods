import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Runtime assets in Convex file storage (scripts/upload-runtime.mjs). One row per name; today the only
 * asset is the Python runtime bundle (`python-runtime.bin.gz`: the CPython 3.15 WASI reactor, its
 * standard library and the trusted guest code).
 */
export const runtimeTables = {
  runtimeAssets: defineTable({
    name: v.string(),
    /** SHA-256 of the asset's content (for the Python bundle: of the uncompressed bundle, the package's pin). */
    sha256: v.string(),
    /** SHA-256 of the stored bytes, checked server-side when the upload is registered. */
    storedSha256: v.string(),
    storageId: v.id("_storage"),
    size: v.number(),
    uploadedAt: v.number(),
  }).index("by_name", ["name"]),
};
