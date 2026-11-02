/** Stored compiled programs (runtime/programs.ts): limits shared by the store and its readers. */
/** A row unused this long is pruned (its next use compiles again). Use refreshes `compiledAt` at most daily. */
export const PROGRAM_TTL_MS = 14 * 24 * 3600_000;
export const PROGRAM_REFRESH_MS = 24 * 3600_000;
/** Larger rows are not stored (a document holds at most 1 MiB); their actions compile them again. */
export const PROGRAM_MAX_BYTES = 900 * 1024;
/** Acts per call to runtime/haskellAct.ts (engine/runtime.ts batches up to it). */
export const HASKELL_ACT_BATCH = 16;
