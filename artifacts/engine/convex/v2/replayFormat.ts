/** What the stored replay's reader and writer share (replays.ts, replayBuild.ts). */
/** The stored file's shape; a reader that finds another version folds `v2Events` itself. */
export const STORED_REPLAY_VERSION = 1;
/** Events per page the build reads, at most. */
export const PAGE = 200;
/**
 * What one page reads, at most (the events' data as JSON): a Grids act is about 6 KB, so 200 of them were 1.2 MB and
 * a page timed out (1 s) on a loaded backend at the end of two five-minute games. A page stops at the event that
 * reaches it.
 */
export const PAGE_BYTES = 256 * 1024;
/** A page that fails (a query timeout on a loaded backend) is read again at half the size, down to 1/8. */
export const SHRINKS = 3;

/** One page of `read`, read again at half the size if it fails (it is a read: nothing to undo), up to SHRINKS times. */
export async function pageAfter<T>(read: (maxBytes: number) => Promise<T>): Promise<T> {
  for (let shrink = 0; ; shrink++) {
    try { return await read(PAGE_BYTES / 2 ** shrink); } catch (e) { if (shrink >= SHRINKS) throw e; }
  }
}
