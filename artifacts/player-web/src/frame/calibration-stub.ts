/**
 * Stands in for lib/game-utilities/data/calibration/v1/index.js in the panel frame's build: the 4.5 MB of
 * shipped tables stay out of panel-runtime.js. A frame never looks tables up; the host sends the player's own
 * over the bridge (src/frame/transport.ts loadTables).
 */
export const MANIFEST = { format: "stub", estimator: { id: "none", version: 0 }, instances: {} };
export const TABLES: Readonly<Record<string, unknown>> = {};
