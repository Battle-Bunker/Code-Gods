/**
 * Stored panels' limits and stored shapes, shared by the tables (tables.ts), the store (panels.ts, V8) and the
 * compiler (panelCompile.ts, Node). Pure: no Convex functions here.
 */
import { v, type Infer } from "convex/values";

export const LIMITS = {
  /** UTF-8 bytes of TSX source. */
  sourceBytes: 64 * 1024,
  /** UTF-8 bytes of compiled CommonJS. */
  compiledBytes: 128 * 1024,
  /** Panels per human (across rooms). */
  panels: 32,
  /** Saves and rollbacks per human per rolling minute. */
  savesPerMinute: 30,
  /** Versions kept per panel (older ones are pruned; the current one is always kept). */
  versionsKept: 20,
} as const;

/** A panel's id: kebab-case, like a file panel's file name. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
export const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
export const bytes = (text: string) => new TextEncoder().encode(text).length;

export const placementV = v.union(v.literal("left"), v.literal("right"), v.literal("bottom"));
export const sizeV = v.union(v.literal("sm"), v.literal("md"), v.literal("lg"));
/** Who wrote a version: the human in a browser, or a delegate acting for them (an assistant, MCP or CLI credential). */
export const authorV = v.object({ kind: v.union(v.literal("browser"), v.literal("delegate")), label: v.string() });
export const diagnosticV = v.object({ line: v.number(), column: v.number(), code: v.string(), message: v.string() });
/** Values read from a literal `definePanel({ title, placement, size })` (the save call can override them). */
export const manifestV = v.object({ title: v.optional(v.string()), placement: v.optional(placementV), size: v.optional(sizeV) });

export type Author = Infer<typeof authorV>;
export type Diagnostic = Infer<typeof diagnosticV>;
export type PanelManifest = Infer<typeof manifestV>;
