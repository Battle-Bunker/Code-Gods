/** Stored-panel limits (docs/panels.md "Stored panels"). Shared by the compiler (Node) and the store (V8). */
export const LIMITS = {
  /** UTF-8 bytes of TSX source. */
  sourceBytes: 64 * 1024,
  /** UTF-8 bytes of compiled CommonJS. */
  compiledBytes: 128 * 1024,
  /** Panels per player (across rooms). */
  panels: 32,
  /** Saves and rollbacks per player per rolling minute. */
  savesPerMinute: 30,
  /** Versions kept per panel (older ones are pruned; the current one is always kept). */
  versionsKept: 20,
  /** Layout JSON, UTF-8 bytes. */
  layoutBytes: 16 * 1024,
} as const;

/** A panel's id: kebab-case, like a file panel's file name. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`;
