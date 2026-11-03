/**
 * An ended game's stored replay (engine convex/replays.ts): every player.replay page, built once when the game ended,
 * as {version, pages} without the caller's place, which replays.stored gives. The engine serves it at
 * GET /api/replay/<roomId>/<gameId> to a caller whose Convex JWT the replay admits (never as a storage URL).
 */
import type { ReplayPage } from "@workspace/player-client/replay";

/** The file version this page reads (engine replays.ts STORED_REPLAY_VERSION); another version pages the log instead. */
export const STORED_REPLAY_VERSION = 1;

/** The engine's route for the stored replay (convex/http.ts); ids are path segments, so they are encoded. */
export const storedReplayUrl = (site: string, roomId: string, gameId: string) =>
  `${site.replace(/\/$/, "")}/api/replay/${encodeURIComponent(roomId)}/${encodeURIComponent(gameId)}`;

export function pagesFromStored(file: unknown, version: number, viewer: ReplayPage["viewer"]): ReplayPage[] {
  const f = file as { version?: unknown; pages?: unknown } | null;
  if (!f || typeof f !== "object" || !Array.isArray(f.pages)) throw new Error("The download is not a stored replay.");
  if (f.version !== version) throw new Error(`The stored replay is version ${String(f.version)}; this page reads version ${version}.`);
  if (!f.pages.length) throw new Error("The stored replay has no pages.");
  const pages = (f.pages as Omit<ReplayPage, "viewer">[]).map(p => ({ ...p, viewer }) as ReplayPage);
  if (!pages.at(-1)!.done) throw new Error("The stored replay is incomplete.");
  return pages;
}
