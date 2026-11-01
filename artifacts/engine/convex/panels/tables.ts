import { defineTable } from "convex/server";
import { v } from "convex/values";

export const placement = v.union(v.literal("left"), v.literal("right"), v.literal("bottom"));
export const size = v.union(v.literal("sm"), v.literal("md"), v.literal("lg"));
/** Who wrote a version: the human in a browser, or one of their credentials (by kind) with its self-reported label. */
export const author = v.object({
  kind: v.union(v.literal("browser"), v.literal("device"), v.literal("oauth"), v.literal("assistant")),
  label: v.string(),
});
export const diagnostic = v.object({ line: v.number(), column: v.number(), code: v.string(), message: v.string() });
export const manifest = v.object({ title: v.optional(v.string()), placement: v.optional(placement), size: v.optional(size) });

/**
 * Stored panels (owned by convex/panels): TSX a human's agents write, compiled on save, rendered by every client
 * of that human in a sandboxed frame. Scoped to the human (`subject`), across rooms.
 */
export const panelTables = {
  panels: defineTable({
    subject: v.string(), slug: v.string(), title: v.string(), placement, size,
    currentVersion: v.number(), enabled: v.boolean(), updatedAt: v.number(),
    /** The current version's author (denormalised for list). */
    author,
    /** The latest version written by a non-browser author: a client's "let it act" grant older than this is void. */
    lastForeignVersion: v.optional(v.number()),
  }).index("by_subject_slug", ["subject", "slug"]),
  /** Immutable versions; the last LIMITS.versionsKept per panel are kept. */
  panelVersions: defineTable({
    panelId: v.id("panels"), version: v.number(), source: v.string(), compiled: v.string(), diagnostics: v.array(diagnostic),
    compilerVersion: v.string(), sourceHash: v.string(), author, manifest, createdAt: v.number(),
    /** Code a non-browser author wrote (also when a browser rollback restored such code). */
    foreign: v.optional(v.boolean()),
  }).index("by_panel_version", ["panelId", "version"]),
  /**
   * RETIRED: the old region dock's layout, replaced by convex/layout/tables.ts dockLayouts. Nothing reads or writes it.
   * Convex refuses a schema whose existing documents fail validation, so the table stays declared until the dev
   * deployment's rows are cleared (testing.ts clearPanelLayouts); a follow-up then drops it. Production has no rows.
   */
  panelLayouts: defineTable({ subject: v.string(), layout: v.any(), updatedAt: v.number() }).index("by_subject", ["subject"]),
  /** Recent save times per human (rolling-minute rate limit; at most LIMITS.savesPerMinute entries). */
  panelQuotas: defineTable({ subject: v.string(), saves: v.array(v.number()) }).index("by_subject", ["subject"]),
};
