import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The player client's dock layout (owned by convex/layout; docs/ui-redesign.md §2.3–2.4): one row per human per room,
 * holding the library-independent tree lib/player-client/src/layout.ts validates. The arrangement follows the human
 * into a new room (layout.current copies the most recent row with panel parameters reset); every open client of the
 * human in that room renders the same row, whether a drag, the palette or an assistant tool wrote it.
 */
export const layoutTables = {
  dockLayouts: defineTable({
    subject: v.string(), roomId: v.id("rooms"),
    /** parseLayout-valid when written; readers re-parse it anyway. ≤ LAYOUT_LIMITS.bytes. */
    layout: v.any(),
    /** The room's current game when written: a new game resets panel parameters. */
    gameId: v.optional(v.string()),
    /** The last writer: the human in a browser, or one of their credentials by kind with its label. */
    setBy: v.object({ kind: v.union(v.literal("browser"), v.literal("device"), v.literal("oauth"), v.literal("assistant")), label: v.string() }),
    updatedAt: v.number(),
    /** Write times in the last minute (LAYOUT_LIMITS.writesPerMinute). */
    recent: v.array(v.number()),
  }).index("by_subject_room", ["subject", "roomId"]).index("by_subject_updated", ["subject", "updatedAt"]),
};
