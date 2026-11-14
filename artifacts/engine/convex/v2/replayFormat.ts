/** What the stored replay's reader and writer share (replays.ts, replayBuild.ts). */
/** The stored file's shape; a reader that finds another version folds `v2Events` itself. */
export const STORED_REPLAY_VERSION = 1;
/** Events per page the build reads. */
export const PAGE = 200;
