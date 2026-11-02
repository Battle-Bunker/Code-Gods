import { defineTable } from "convex/server";
import { v } from "convex/values";
import { languageV } from "../lib/language";

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
  /**
   * Agent sandbox readiness, one row per language for the deployment (lib/sandboxes.ts has the rules; runtime/readiness.ts
   * writes it, runtime/warm.ts boots). Read by the observation, the tick, AI seats and every function that runs agent code.
   */
  runtimeReadiness: defineTable({
    language: languageV,
    /** The runtime version this row is about (the Python bundle's pin; `builtin:<language>` for packaged runtimes). */
    version: v.string(),
    state: v.union(v.literal("warming"), v.literal("ready"), v.literal("failed")),
    reason: v.optional(v.string()),
    attemptAt: v.number(),
    attempts: v.number(),
    readyAt: v.optional(v.number()),
    /** The latest boot's wall time (diagnostics). */
    bootMs: v.optional(v.number()),
  }).index("by_language", ["language"]),
  /**
   * Compiled Haskell agents (runtime/haskellCompile.ts), so no other action compiles them: the compiler needs about
   * 250 MiB, kept out of the actions that run the agent pools. `key`: runtime/node.ts haskellKey (the bundle pin, the
   * room's prelude, the source). Rows unused for HASKELL_PROGRAM_TTL_MS (`compiledAt`, refreshed daily by use) are pruned (runtime/haskellPrograms.ts).
   */
  haskellPrograms: defineTable({
    key: v.string(),
    /** The MicroHs combinator program (trusted compiler output); empty when the source does not compile. */
    js: v.string(),
    /** The compiler's Inspection (the summon price's parts); null when the source does not compile. */
    inspection: v.any(),
    /** The agent's own compile failure (COMPILE or LIMIT), the same for every later request of this key. */
    error: v.optional(v.object({ code: v.string(), message: v.string() })),
    compiledAt: v.number(),
  }).index("by_key", ["key"]).index("by_compiledAt", ["compiledAt"]),
  /**
   * MicroHs compilation caches of Haskell rooms (runtime/haskellCompile.ts), gzip in file storage: a compiler with a
   * room's cache skips compiling its Room module (a cloud compilation from ~37 s to a fraction). `key`: runtime/node.ts
   * haskellRoomKey (the bundle and the Room module). Pruned like haskellPrograms.
   */
  haskellRoomCaches: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
    /** Uncompressed bytes. */
    size: v.number(),
    usedAt: v.number(),
  }).index("by_key", ["key"]).index("by_usedAt", ["usedAt"]),
};
