/**
 * The assistant's mode, one per (room, human), kept across the room's games like the player's layout
 * (docs/surface-architecture.md §6 "Modes"):
 *   - autopilot: plays on its own, without being prompted (assistant/autopilot.ts schedules its turns);
 *   - onRequest: acts (mutations allowed) only in response to the player's messages (the default);
 *   - readOnly: answers questions with read-only tools; never mutates (enforced in the tool dispatch, assistant/step.ts).
 * Plain values, no imports beyond convex/values: hot reactive queries (assistant.ts status) load it.
 */
import { v } from "convex/values";

export const MODES = ["autopilot", "onRequest", "readOnly"] as const;
export type AssistantMode = (typeof MODES)[number];
export const DEFAULT_MODE: AssistantMode = "onRequest";
export const modeV = v.union(v.literal("autopilot"), v.literal("onRequest"), v.literal("readOnly"));
/** The names the player sees (the pane, the palette, the docs). */
export const MODE_LABELS: Record<AssistantMode, string> = { autopilot: "Autopilot", onRequest: "On request", readOnly: "Read-only" };
