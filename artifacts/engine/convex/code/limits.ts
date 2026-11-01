/**
 * Limits of code runs (docs/assistant/code-execution.md §4): pure constants shared by the engine functions and the tests.
 */
export const CODE_LIMITS = {
  /** Per player per game ("lobby" before the first game): runs started, and CPU seconds used. */
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
  /** Runs kept per player (older rows and their stored results are deleted). */
  keptRuns: 50,
} as const;
