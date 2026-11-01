/**
 * Limits of code runs (docs/assistant/code-execution.md §4): pure constants shared by the engine functions and the tests.
 */
export const CODE_LIMITS = {
  /** Per player per game (per room before its first game): runs started, and CPU seconds used. */
  runsPerGame: 40,
  cpuMsPerGame: 120_000,
  /** One run's CPU budget (ms): default and maximum (the runtime's own maximum is 20 s). */
  cpuMsDefault: 10_000,
  cpuMsMax: 20_000,
  /** A run still "running" after this long counts as failed (its action died). */
  staleMs: 2 * 60_000,
  /** The JSON text of all requested datasets (the runtime's input limit). */
  inputBytes: 4 * 1024 * 1024,
  /** Kept in the run's row (else in file storage, with a preview in the row). */
  rowResultChars: 200_000,
  rowOutputChars: 64 * 1024,
  /** Previews returned to the model by run_code. */
  previewResultChars: 3_500,
  previewOutputChars: 1_500,
  /** Runs kept per player (older rows and their runs/<id> result objects are deleted). */
  keptRuns: 50,
  /** The object store, per human and game, saved scripts included (runs/ results not counted): objects, total bytes,
   * one value, keys a run may write. */
  objectsPerUser: 500,
  objectBytesPerUser: 20 * 1024 * 1024,
  valueBytes: 1024 * 1024,
  writesPerRun: 100,
  /** Earlier games whose objects a human keeps (with the current one): older games' objects are deleted. */
  keptGames: 5,
  /** A value this size or smaller lives in its row; a larger one in file storage. */
  inlineValueChars: 64 * 1024,
  /** Scopes a run may load, and the loaded objects' JSON (the runtime's storeBytes). */
  scopesPerRun: 20,
  loadBytes: 4_000_000,
} as const;
